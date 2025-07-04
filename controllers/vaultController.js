const db = require('../database/db');

const denominationFields = [
  'ones', 'fives', 'tens', 'twenties', 'forties', 'fifties',
  'hundreds', 'twoHundreds', 'fiveHundreds', 'thousands'
];

const vaultController = {
  // Get vault balance
  getVaultBalance: async (req, res) => {
    try {
      const { vaultId = 1 } = req.params;
      
      const [vaults] = await db.query(
        'SELECT * FROM vault WHERE id = ?',
        [vaultId]
      );
      
      if (vaults.length === 0) {
        return res.status(404).json({ message: 'Vault not found' });
      }
      
      res.json(vaults[0]);
    } catch (error) {
      console.error('Error fetching vault balance:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Get vault update history
  getVaultUpdates: async (req, res) => {
    try {
      const { vaultId = 1 } = req.params;
      
      const [updates] = await db.query(`
        SELECT vu.*, 
          c.name as client_name,
          b.name as branch_name,
          t.name as team_name
        FROM vault_update vu
        LEFT JOIN clients c ON vu.client_id = c.id
        LEFT JOIN branches b ON vu.branch_id = b.id
        LEFT JOIN teams t ON vu.team_id = t.id
        WHERE vu.vault_id = ?
        ORDER BY vu.created_at DESC
      `, [vaultId]);
      
      res.json(updates);
    } catch (error) {
      console.error('Error fetching vault updates:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Receive amount into vault
  receiveAmount: async (req, res) => {
    try {
      const { 
        vaultId = 1,
        clientId,
        branchId,
        teamId,
        amount,
        comment = 'Cash count received',
        cashCountId, // Add cash count ID to update status
        denominations = {} // New: denomination breakdown
      } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Valid amount is required' });
      }

      // Start transaction
      await db.query('START TRANSACTION');

      try {
        // Get current vault balance and denominations
        const [vaults] = await db.query(
          'SELECT * FROM vault WHERE id = ? FOR UPDATE',
          [vaultId]
        );

        if (vaults.length === 0) {
          await db.query('ROLLBACK');
          return res.status(404).json({ message: 'Vault not found' });
        }

        const currentBalance = parseFloat(vaults[0].current_balance);
        const newBalance = currentBalance + parseFloat(amount);

        // Insert vault update record with denominations
        const denomValues = denominationFields.map(field => parseInt(denominations[field] || 0));
        const [result] = await db.query(`
          INSERT INTO vault_update (
            vault_id, client_id, branch_id, team_id, 
            amount_in, amount_out, new_balance, comment,
            ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vaultId, clientId || null, branchId || null, teamId || null,
          amount, 0, newBalance, comment,
          ...denomValues
        ]);

        // Insert client_update record if clientId is present
        if (clientId) {
          const clientUpdateColumns = [
            'client_id', 'branch_id', 'team_id', 'type', 'amount', 'new_balance', 'comment',
            ...denominationFields
          ];
          const clientUpdateValues = [
            clientId, branchId || null, teamId || null, 'credit', amount, newBalance, comment,
            ...denomValues
          ];
          console.log('client_update columns:', clientUpdateColumns, 'length:', clientUpdateColumns.length);
          console.log('client_update values:', clientUpdateValues, 'length:', clientUpdateValues.length);
          await db.query(`
            INSERT INTO client_update (
              client_id, branch_id, team_id, type, amount, new_balance, comment,
              ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, clientUpdateValues);
        }

        // Update vault balance
        await db.query(
          'UPDATE vault SET current_balance = ? WHERE id = ?',
          [newBalance, vaultId]
        );

        // Update denomination columns
        let denomUpdateSql = 'UPDATE vault SET ';
        let denomUpdateParams = [];
        denomUpdateSql += denominationFields.map(field => `${field} = ${field} + ?`).join(', ');
        denomUpdateSql += ' WHERE id = ?';
        denomUpdateParams = denominationFields.map(field => parseInt(denominations[field] || 0));
        denomUpdateParams.push(vaultId);
        await db.query(denomUpdateSql, denomUpdateParams);

        // Update cash count status if cashCountId is provided
        if (cashCountId) {
          await db.query(
            'UPDATE cash_counts SET status = ? WHERE id = ?',
            ['received', cashCountId]
          );
        }

        // Commit transaction
        await db.query('COMMIT');

        // Fetch the created update record (include denominations)
        const [updates] = await db.query(`
          SELECT vu.*, 
            c.name as client_name,
            b.name as branch_name,
            t.name as team_name
          FROM vault_update vu
          LEFT JOIN clients c ON vu.client_id = c.id
          LEFT JOIN branches b ON vu.branch_id = b.id
          LEFT JOIN teams t ON vu.team_id = t.id
          WHERE vu.id = ?
        `, [result.insertId]);

        res.status(201).json({
          message: 'Amount received successfully',
          update: updates[0],
          newBalance: newBalance
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error receiving amount:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Withdraw amount from vault
  withdrawAmount: async (req, res) => {
    try {
      const { 
        vaultId = 1,
        clientId,
        branchId,
        teamId,
        amount,
        comment = 'Amount withdrawn',
        denominations = {} // New: denomination breakdown
      } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Valid amount is required' });
      }

      // Start transaction
      await db.query('START TRANSACTION');

      try {
        // Get current vault balance and denominations
        const [vaults] = await db.query(
          'SELECT * FROM vault WHERE id = ? FOR UPDATE',
          [vaultId]
        );

        if (vaults.length === 0) {
          await db.query('ROLLBACK');
          return res.status(404).json({ message: 'Vault not found' });
        }

        const currentBalance = parseFloat(vaults[0].current_balance);
        if (currentBalance < parseFloat(amount)) {
          await db.query('ROLLBACK');
          return res.status(400).json({ message: 'Insufficient funds in vault' });
        }

        // Check for negative denominations
        for (const field of denominationFields) {
          const current = parseInt(vaults[0][field] || 0);
          const withdraw = parseInt(denominations[field] || 0);
          if (withdraw > current) {
            await db.query('ROLLBACK');
            return res.status(400).json({ message: `Insufficient ${field} notes in vault` });
          }
        }

        const newBalance = currentBalance - parseFloat(amount);

        // Insert vault update record with denominations
        const denomValues = denominationFields.map(field => parseInt(denominations[field] || 0));
        const [result] = await db.query(`
          INSERT INTO vault_update (
            vault_id, client_id, branch_id, team_id, 
            amount_in, amount_out, new_balance, comment,
            ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vaultId, clientId || null, branchId || null, teamId || null,
          0, amount, newBalance, comment,
          ...denomValues
        ]);

        // Insert client_update record if clientId is present
        if (clientId) {
          const clientUpdateColumns = [
            'client_id', 'branch_id', 'team_id', 'type', 'amount', 'new_balance', 'comment',
            ...denominationFields
          ];
          const clientUpdateValues = [
            clientId, branchId || null, teamId || null, 'debit', amount, newBalance, comment,
            ...denomValues
          ];
          console.log('client_update columns:', clientUpdateColumns, 'length:', clientUpdateColumns.length);
          console.log('client_update values:', clientUpdateValues, 'length:', clientUpdateValues.length);
          await db.query(`
            INSERT INTO client_update (
              client_id, branch_id, team_id, type, amount, new_balance, comment,
              ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, clientUpdateValues);
        }

        // Update vault balance
        await db.query(
          'UPDATE vault SET current_balance = ? WHERE id = ?',
          [newBalance, vaultId]
        );

        // Update denomination columns (decrement)
        let denomUpdateSql = 'UPDATE vault SET ';
        let denomUpdateParams = [];
        denomUpdateSql += denominationFields.map(field => `${field} = ${field} - ?`).join(', ');
        denomUpdateSql += ' WHERE id = ?';
        denomUpdateParams = denominationFields.map(field => parseInt(denominations[field] || 0));
        denomUpdateParams.push(vaultId);
        await db.query(denomUpdateSql, denomUpdateParams);

        // Commit transaction
        await db.query('COMMIT');

        // Fetch the created update record (include denominations)
        const [updates] = await db.query(`
          SELECT vu.*, 
            c.name as client_name,
            b.name as branch_name,
            t.name as team_name
          FROM vault_update vu
          LEFT JOIN clients c ON vu.client_id = c.id
          LEFT JOIN branches b ON vu.branch_id = b.id
          LEFT JOIN teams t ON vu.team_id = t.id
          WHERE vu.id = ?
        `, [result.insertId]);

        res.status(201).json({
          message: 'Amount withdrawn successfully',
          update: updates[0],
          newBalance: newBalance
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error withdrawing amount:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

module.exports = vaultController; 