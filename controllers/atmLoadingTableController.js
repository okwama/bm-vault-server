const db = require('../database/db');

const atmLoadingTableController = {
  // Create ATM loading record
  createATMLoading: async (req, res) => {
    try {
      const {
        client_id,
        atm_id,
        denominations,
        loading_date,
        comment
      } = req.body;

      console.log('Creating ATM loading record:', {
        client_id,
        atm_id,
        denominations,
        loading_date,
        comment
      });

      // Validate required fields
      if (!client_id || !atm_id || !denominations || !loading_date) {
        return res.status(400).json({ 
          message: 'Client ID, ATM ID, denominations, and loading date are required' 
        });
      }

      // Validate that the ATM belongs to the client
      const [atmCheck] = await db.query(
        'SELECT id FROM atms WHERE id = ? AND client_id = ?',
        [atm_id, client_id]
      );

      if (atmCheck.length === 0) {
        return res.status(400).json({ 
          message: 'ATM not found or does not belong to the specified client' 
        });
      }

      // Calculate total amount from denominations
      const totalAmount = (
        (denominations.ones || 0) * 1 +
        (denominations.fives || 0) * 5 +
        (denominations.tens || 0) * 10 +
        (denominations.twenties || 0) * 20 +
        (denominations.forties || 0) * 40 +
        (denominations.fifties || 0) * 50 +
        (denominations.hundreds || 0) * 100 +
        (denominations.twoHundreds || 0) * 200 +
        (denominations.fiveHundreds || 0) * 500 +
        (denominations.thousands || 0) * 1000
      );

      // Get current client balance
      const [currentBalance] = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credits,
          COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debits
        FROM client_update 
        WHERE client_id = ?
      `, [client_id]);

      const currentBalanceAmount = currentBalance[0].total_credits - currentBalance[0].total_debits;
      const newBalance = currentBalanceAmount - totalAmount;

      // Check if client has sufficient balance
      if (newBalance < 0) {
        return res.status(400).json({ 
          message: 'Insufficient client balance for this ATM loading transaction' 
        });
      }

      // Get current vault balance (assuming vault ID 1)
      const [vaultData] = await db.query(
        'SELECT * FROM vault WHERE id = 1'
      );

      if (vaultData.length === 0) {
        return res.status(400).json({ 
          message: 'Vault not found' 
        });
      }

      const vault = vaultData[0];
      const newVaultBalance = vault.current_balance - totalAmount;

      // Check if vault has sufficient balance
      if (newVaultBalance < 0) {
        return res.status(400).json({ 
          message: 'Insufficient vault balance for this ATM loading transaction' 
        });
      }

      // Start transaction
      await db.query('START TRANSACTION');

      try {
        // Insert ATM loading record
        const [result] = await db.query(`
          INSERT INTO atm_loading (
            client_id, atm_id, ones, fives, tens, twenties, forties, fifties, 
            hundreds, twoHundreds, fiveHundreds, thousands, total_amount, 
            loading_date, comment
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          client_id,
          atm_id,
          denominations.ones || 0,
          denominations.fives || 0,
          denominations.tens || 0,
          denominations.twenties || 0,
          denominations.forties || 0,
          denominations.fifties || 0,
          denominations.hundreds || 0,
          denominations.twoHundreds || 0,
          denominations.fiveHundreds || 0,
          denominations.thousands || 0,
          totalAmount,
          loading_date,
          comment || null
        ]);

        // Insert client update record
        await db.query(`
          INSERT INTO client_update (
            client_id, atm_id, type, amount, new_balance, comment,
            ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands,
            transaction_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          client_id,
          atm_id,
          'debit', // ATM loading is a debit from client account
          totalAmount,
          newBalance,
          `ATM Loading - ${comment || 'ATM replenishment'}`,
          denominations.ones || 0,
          denominations.fives || 0,
          denominations.tens || 0,
          denominations.twenties || 0,
          denominations.forties || 0,
          denominations.fifties || 0,
          denominations.hundreds || 0,
          denominations.twoHundreds || 0,
          denominations.fiveHundreds || 0,
          denominations.thousands || 0,
          loading_date ? loading_date : new Date(), // transaction_date
          new Date() // created_at
        ]);

        // Update vault balance
        await db.query(`
          UPDATE vault SET
            current_balance = ?,
            ones = ones - ?,
            fives = fives - ?,
            tens = tens - ?,
            twenties = twenties - ?,
            forties = forties - ?,
            fifties = fifties - ?,
            hundreds = hundreds - ?,
            twoHundreds = twoHundreds - ?,
            fiveHundreds = fiveHundreds - ?,
            thousands = thousands - ?,
            updated_at = NOW()
          WHERE id = 1
        `, [
          newVaultBalance,
          denominations.ones || 0,
          denominations.fives || 0,
          denominations.tens || 0,
          denominations.twenties || 0,
          denominations.forties || 0,
          denominations.fifties || 0,
          denominations.hundreds || 0,
          denominations.twoHundreds || 0,
          denominations.fiveHundreds || 0,
          denominations.thousands || 0
        ]);

        // Insert vault update record
        await db.query(`
          INSERT INTO vault_update (
            vault_id, client_id, team_id, amount_in, amount_out, new_balance, comment,
            ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands,
            transaction_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, // vault_id
          client_id,
          null, // team_id (no team involved in ATM loading)
          0, // amount_in
          totalAmount, // amount_out (withdrawal from vault)
          newVaultBalance,
          `ATM Loading - ${comment || 'ATM replenishment'}`,
          denominations.ones || 0,
          denominations.fives || 0,
          denominations.tens || 0,
          denominations.twenties || 0,
          denominations.forties || 0,
          denominations.fifties || 0,
          denominations.hundreds || 0,
          denominations.twoHundreds || 0,
          denominations.fiveHundreds || 0,
          denominations.thousands || 0,
          loading_date ? loading_date : new Date(), // transaction_date
          new Date() // created_at
        ]);

        // Commit transaction
        await db.query('COMMIT');

        // Fetch the created record with client and ATM details
        const [record] = await db.query(`
          SELECT al.*, 
            c.name as client_name,
            a.atm_code,
            a.location as atm_location
          FROM atm_loading al
          LEFT JOIN clients c ON al.client_id = c.id
          LEFT JOIN atms a ON al.atm_id = a.id
          WHERE al.id = ?
        `, [result.insertId]);

        console.log('ATM loading record created successfully:', record[0]);

        res.status(201).json({
          message: 'ATM loading record created successfully',
          record: record[0],
          newBalance: newBalance,
          newVaultBalance: newVaultBalance
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error creating ATM loading record:', error);
      res.status(500).json({ 
        message: 'Failed to create ATM loading record',
        error: error.message 
      });
    }
  },

  // Get all ATM loading records
  getAllATMLoading: async (req, res) => {
    try {
      console.log('Fetching all ATM loading records');

      const [records] = await db.query(`
        SELECT al.*, 
          c.name as client_name,
          a.atm_code,
          a.location as atm_location
        FROM atm_loading al
        LEFT JOIN clients c ON al.client_id = c.id
        LEFT JOIN atms a ON al.atm_id = a.id
        ORDER BY al.created_at DESC
      `);

      console.log(`Found ${records.length} ATM loading records`);
      res.json(records);
    } catch (error) {
      console.error('Error fetching ATM loading records:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading records',
        error: error.message 
      });
    }
  },

  // Get ATM loading record by ID
  getATMLoadingById: async (req, res) => {
    try {
      const { id } = req.params;
      console.log('Fetching ATM loading record by ID:', id);

      const [records] = await db.query(`
        SELECT al.*, 
          c.name as client_name,
          a.atm_code,
          a.location as atm_location
        FROM atm_loading al
        LEFT JOIN clients c ON al.client_id = c.id
        LEFT JOIN atms a ON al.atm_id = a.id
        WHERE al.id = ?
      `, [id]);

      if (records.length === 0) {
        return res.status(404).json({ message: 'ATM loading record not found' });
      }

      console.log('ATM loading record found:', records[0]);
      res.json(records[0]);
    } catch (error) {
      console.error('Error fetching ATM loading record:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading record',
        error: error.message 
      });
    }
  },

  // Get ATM loading records by client
  getATMLoadingByClient: async (req, res) => {
    try {
      const { clientId } = req.params;
      console.log('Fetching ATM loading records for client ID:', clientId);

      const [records] = await db.query(`
        SELECT al.*, 
          a.atm_code,
          a.location as atm_location
        FROM atm_loading al
        LEFT JOIN atms a ON al.atm_id = a.id
        WHERE al.client_id = ?
        ORDER BY al.created_at DESC
      `, [clientId]);

      console.log(`Found ${records.length} ATM loading records for client ${clientId}`);
      res.json(records);
    } catch (error) {
      console.error('Error fetching ATM loading records by client:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading records',
        error: error.message 
      });
    }
  },

  // Get ATM loading records by ATM
  getATMLoadingByATM: async (req, res) => {
    try {
      const { atmId } = req.params;
      console.log('Fetching ATM loading records for ATM ID:', atmId);

      const [records] = await db.query(`
        SELECT al.*, 
          c.name as client_name
        FROM atm_loading al
        LEFT JOIN clients c ON al.client_id = c.id
        WHERE al.atm_id = ?
        ORDER BY al.created_at DESC
      `, [atmId]);

      console.log(`Found ${records.length} ATM loading records for ATM ${atmId}`);
      res.json(records);
    } catch (error) {
      console.error('Error fetching ATM loading records by ATM:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading records',
        error: error.message 
      });
    }
  },

  // Update ATM loading record
  updateATMLoading: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        client_id,
        atm_id,
        denominations,
        loading_date,
        comment
      } = req.body;

      console.log('Updating ATM loading record:', {
        id,
        client_id,
        atm_id,
        denominations,
        loading_date,
        comment
      });

      // Check if record exists
      const [existingRecord] = await db.query(
        'SELECT * FROM atm_loading WHERE id = ?',
        [id]
      );

      if (existingRecord.length === 0) {
        return res.status(404).json({ message: 'ATM loading record not found' });
      }

      const oldRecord = existingRecord[0];

      // Calculate total amount from denominations
      const totalAmount = (
        (denominations.ones || 0) * 1 +
        (denominations.fives || 0) * 5 +
        (denominations.tens || 0) * 10 +
        (denominations.twenties || 0) * 20 +
        (denominations.forties || 0) * 40 +
        (denominations.fifties || 0) * 50 +
        (denominations.hundreds || 0) * 100 +
        (denominations.twoHundreds || 0) * 200 +
        (denominations.fiveHundreds || 0) * 500 +
        (denominations.thousands || 0) * 1000
      );

      // Calculate the difference in amount
      const amountDifference = totalAmount - oldRecord.total_amount;

      // Get current vault balance
      const [vaultData] = await db.query(
        'SELECT * FROM vault WHERE id = 1'
      );

      if (vaultData.length === 0) {
        return res.status(400).json({ 
          message: 'Vault not found' 
        });
      }

      const vault = vaultData[0];
      const newVaultBalance = vault.current_balance - amountDifference;

      // Check if vault has sufficient balance for the difference
      if (newVaultBalance < 0) {
        return res.status(400).json({ 
          message: 'Insufficient vault balance for this ATM loading update' 
        });
      }

      // Start transaction
      await db.query('START TRANSACTION');

      try {
        // Update the ATM loading record
        await db.query(`
          UPDATE atm_loading SET
            client_id = ?, atm_id = ?, ones = ?, fives = ?, tens = ?, twenties = ?,
            forties = ?, fifties = ?, hundreds = ?, twoHundreds = ?, fiveHundreds = ?,
            thousands = ?, total_amount = ?, loading_date = ?, comment = ?
          WHERE id = ?
        `, [
          client_id,
          atm_id,
          denominations.ones || 0,
          denominations.fives || 0,
          denominations.tens || 0,
          denominations.twenties || 0,
          denominations.forties || 0,
          denominations.fifties || 0,
          denominations.hundreds || 0,
          denominations.twoHundreds || 0,
          denominations.fiveHundreds || 0,
          denominations.thousands || 0,
          totalAmount,
          loading_date,
          comment || null,
          id
        ]);

        // Update the corresponding client_update record
        await db.query(`
          UPDATE client_update SET
            client_id = ?, atm_id = ?, amount = ?, comment = ?,
            ones = ?, fives = ?, tens = ?, twenties = ?, forties = ?, fifties = ?,
            hundreds = ?, twoHundreds = ?, fiveHundreds = ?, thousands = ?
          WHERE client_id = ? AND atm_id = ? AND type = 'debit' 
          AND comment LIKE 'ATM Loading - %'
          AND created_at = ?
        `, [
          client_id,
          atm_id,
          totalAmount,
          `ATM Loading - ${comment || 'ATM replenishment'}`,
          denominations.ones || 0,
          denominations.fives || 0,
          denominations.tens || 0,
          denominations.twenties || 0,
          denominations.forties || 0,
          denominations.fifties || 0,
          denominations.hundreds || 0,
          denominations.twoHundreds || 0,
          denominations.fiveHundreds || 0,
          denominations.thousands || 0,
          oldRecord.client_id,
          oldRecord.atm_id,
          oldRecord.created_at
        ]);

        // Update vault balance if there's a difference
        if (amountDifference !== 0) {
          await db.query(`
            UPDATE vault SET
              current_balance = ?,
              ones = ones - ?,
              fives = fives - ?,
              tens = tens - ?,
              twenties = twenties - ?,
              forties = forties - ?,
              fifties = fifties - ?,
              hundreds = hundreds - ?,
              twoHundreds = twoHundreds - ?,
              fiveHundreds = fiveHundreds - ?,
              thousands = thousands - ?,
              updated_at = NOW()
            WHERE id = 1
          `, [
            newVaultBalance,
            (denominations.ones || 0) - (oldRecord.ones || 0),
            (denominations.fives || 0) - (oldRecord.fives || 0),
            (denominations.tens || 0) - (oldRecord.tens || 0),
            (denominations.twenties || 0) - (oldRecord.twenties || 0),
            (denominations.forties || 0) - (oldRecord.forties || 0),
            (denominations.fifties || 0) - (oldRecord.fifties || 0),
            (denominations.hundreds || 0) - (oldRecord.hundreds || 0),
            (denominations.twoHundreds || 0) - (oldRecord.twoHundreds || 0),
            (denominations.fiveHundreds || 0) - (oldRecord.fiveHundreds || 0),
            (denominations.thousands || 0) - (oldRecord.thousands || 0)
          ]);

          // Insert vault update record for the difference
          await db.query(`
            INSERT INTO vault_update (
              vault_id, client_id, team_id, amount_in, amount_out, new_balance, comment,
              ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands,
              transaction_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            1, // vault_id
            client_id,
            null, // team_id
            0, // amount_in
            Math.abs(amountDifference), // amount_out (additional withdrawal)
            newVaultBalance,
            `ATM Loading Update - ${amountDifference > 0 ? 'Additional' : 'Reduced'} ${Math.abs(amountDifference)}`,
            Math.abs((denominations.ones || 0) - (oldRecord.ones || 0)),
            Math.abs((denominations.fives || 0) - (oldRecord.fives || 0)),
            Math.abs((denominations.tens || 0) - (oldRecord.tens || 0)),
            Math.abs((denominations.twenties || 0) - (oldRecord.twenties || 0)),
            Math.abs((denominations.forties || 0) - (oldRecord.forties || 0)),
            Math.abs((denominations.fifties || 0) - (oldRecord.fifties || 0)),
            Math.abs((denominations.hundreds || 0) - (oldRecord.hundreds || 0)),
            Math.abs((denominations.twoHundreds || 0) - (oldRecord.twoHundreds || 0)),
            Math.abs((denominations.fiveHundreds || 0) - (oldRecord.fiveHundreds || 0)),
            Math.abs((denominations.thousands || 0) - (oldRecord.thousands || 0)),
            new Date(), // transaction_date
            new Date() // created_at
          ]);
        }

        // Commit transaction
        await db.query('COMMIT');

        // Fetch the updated record
        const [updatedRecord] = await db.query(`
          SELECT al.*, 
            c.name as client_name,
            a.atm_code,
            a.location as atm_location
          FROM atm_loading al
          LEFT JOIN clients c ON al.client_id = c.id
          LEFT JOIN atms a ON al.atm_id = a.id
          WHERE al.id = ?
        `, [id]);

        console.log('ATM loading record updated successfully:', updatedRecord[0]);

        res.json({
          message: 'ATM loading record updated successfully',
          record: updatedRecord[0]
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error updating ATM loading record:', error);
      res.status(500).json({ 
        message: 'Failed to update ATM loading record',
        error: error.message 
      });
    }
  },

  // Delete ATM loading record
  deleteATMLoading: async (req, res) => {
    try {
      const { id } = req.params;
      console.log('Deleting ATM loading record:', id);

      // Check if record exists and get its details
      const [existingRecord] = await db.query(
        'SELECT * FROM atm_loading WHERE id = ?',
        [id]
      );

      if (existingRecord.length === 0) {
        return res.status(404).json({ message: 'ATM loading record not found' });
      }

      const record = existingRecord[0];

      // Get current vault balance
      const [vaultData] = await db.query(
        'SELECT * FROM vault WHERE id = 1'
      );

      if (vaultData.length === 0) {
        return res.status(400).json({ 
          message: 'Vault not found' 
        });
      }

      const vault = vaultData[0];
      const newVaultBalance = vault.current_balance + record.total_amount;

      // Start transaction
      await db.query('START TRANSACTION');

      try {
        // Delete the ATM loading record
        await db.query('DELETE FROM atm_loading WHERE id = ?', [id]);

        // Delete the corresponding client_update record
        await db.query(`
          DELETE FROM client_update 
          WHERE client_id = ? AND atm_id = ? AND type = 'debit' 
          AND comment LIKE 'ATM Loading - %'
          AND created_at = ?
        `, [record.client_id, record.atm_id, record.created_at]);

        // Restore vault balance
        await db.query(`
          UPDATE vault SET
            current_balance = ?,
            ones = ones + ?,
            fives = fives + ?,
            tens = tens + ?,
            twenties = twenties + ?,
            forties = forties + ?,
            fifties = fifties + ?,
            hundreds = hundreds + ?,
            twoHundreds = twoHundreds + ?,
            fiveHundreds = fiveHundreds + ?,
            thousands = thousands + ?,
            updated_at = NOW()
          WHERE id = 1
        `, [
          newVaultBalance,
          record.ones || 0,
          record.fives || 0,
          record.tens || 0,
          record.twenties || 0,
          record.forties || 0,
          record.fifties || 0,
          record.hundreds || 0,
          record.twoHundreds || 0,
          record.fiveHundreds || 0,
          record.thousands || 0
        ]);

        // Insert vault update record for restoration
        await db.query(`
          INSERT INTO vault_update (
            vault_id, client_id, team_id, amount_in, amount_out, new_balance, comment,
            ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands,
            transaction_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, // vault_id
          record.client_id,
          null, // team_id
          record.total_amount, // amount_in (restoration to vault)
          0, // amount_out
          newVaultBalance,
          `ATM Loading Deletion - Restored ${record.total_amount}`,
          record.ones || 0,
          record.fives || 0,
          record.tens || 0,
          record.twenties || 0,
          record.forties || 0,
          record.fifties || 0,
          record.hundreds || 0,
          record.twoHundreds || 0,
          record.fiveHundreds || 0,
          record.thousands || 0,
          new Date(), // transaction_date
          new Date() // created_at
        ]);

        // Commit transaction
        await db.query('COMMIT');

        console.log('ATM loading record and related records deleted successfully');

        res.json({
          message: 'ATM loading record deleted successfully'
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error deleting ATM loading record:', error);
      res.status(500).json({ 
        message: 'Failed to delete ATM loading record',
        error: error.message 
      });
    }
  }
};

module.exports = atmLoadingTableController; 