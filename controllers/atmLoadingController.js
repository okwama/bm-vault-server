const db = require('../database/db');

const atmLoadingController = {
  // Create ATM loading transaction
  createATMLoading: async (req, res) => {
    try {
      const {
        client_id,
        atm_id,
        amount,
        denominations,
        comment,
        loading_date
      } = req.body;

      console.log('Creating ATM loading transaction:', {
        client_id,
        atm_id,
        amount,
        denominations,
        comment,
        loading_date
      });

      // Validate required fields
      if (!client_id || !atm_id || !amount || !denominations) {
        return res.status(400).json({ 
          message: 'Client ID, ATM ID, amount, and denominations are required' 
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

      // Get current client balance
      const [currentBalance] = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credits,
          COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debits
        FROM client_update 
        WHERE client_id = ?
      `, [client_id]);

      const currentBalanceAmount = currentBalance[0].total_credits - currentBalance[0].total_debits;
      const newBalance = currentBalanceAmount - amount;

      // Check if client has sufficient balance
      if (newBalance < 0) {
        return res.status(400).json({ 
          message: 'Insufficient client balance for this ATM loading transaction' 
        });
      }

      // Start transaction
      await db.query('START TRANSACTION');

      try {
        // Insert ATM loading transaction into client_update table
        const [result] = await db.query(`
          INSERT INTO client_update (
            client_id, atm_id, type, amount, new_balance, comment,
            ones, fives, tens, twenties, forties, fifties, hundreds, twoHundreds, fiveHundreds, thousands,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          client_id,
          atm_id,
          'debit', // ATM loading is a debit from client account
          amount,
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
          loading_date ? `${loading_date} 00:00:00` : new Date()
        ]);

        // Commit transaction
        await db.query('COMMIT');

        // Fetch the created transaction with ATM details
        const [transaction] = await db.query(`
          SELECT cu.*, 
            c.name as client_name,
            a.atm_code,
            a.location as atm_location
          FROM client_update cu
          LEFT JOIN clients c ON cu.client_id = c.id
          LEFT JOIN atms a ON cu.atm_id = a.id
          WHERE cu.id = ?
        `, [result.insertId]);

        console.log('ATM loading transaction created successfully:', transaction[0]);

        res.status(201).json({
          message: 'ATM loading transaction recorded successfully',
          transaction: transaction[0],
          newBalance: newBalance
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error creating ATM loading transaction:', error);
      res.status(500).json({ 
        message: 'Failed to create ATM loading transaction',
        error: error.message 
      });
    }
  },

  // Get ATM loading history for a specific client
  getATMLoadingHistory: async (req, res) => {
    try {
      const { clientId } = req.params;
      console.log('Fetching ATM loading history for client ID:', clientId);

      const [transactions] = await db.query(`
        SELECT cu.*, 
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ? AND cu.atm_id IS NOT NULL
        ORDER BY cu.created_at DESC
      `, [clientId]);

      console.log(`Found ${transactions.length} ATM loading transactions`);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching ATM loading history:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading history',
        error: error.message 
      });
    }
  },

  // Get ATM loading history for a specific ATM
  getATMLoadingHistoryByATM: async (req, res) => {
    try {
      const { atmId } = req.params;
      console.log('Fetching ATM loading history for ATM ID:', atmId);

      const [transactions] = await db.query(`
        SELECT cu.*, 
          c.name as client_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN clients c ON cu.client_id = c.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.atm_id = ?
        ORDER BY cu.created_at DESC
      `, [atmId]);

      console.log(`Found ${transactions.length} ATM loading transactions for ATM ${atmId}`);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching ATM loading history by ATM:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading history',
        error: error.message 
      });
    }
  },

  // Get all ATM loading transactions
  getAllATMLoading: async (req, res) => {
    try {
      console.log('Fetching all ATM loading transactions');

      const [transactions] = await db.query(`
        SELECT cu.*, 
          c.name as client_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN clients c ON cu.client_id = c.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.atm_id IS NOT NULL
        ORDER BY cu.created_at DESC
      `);

      console.log(`Found ${transactions.length} ATM loading transactions`);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching all ATM loading transactions:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ATM loading transactions',
        error: error.message 
      });
    }
  }
};

module.exports = atmLoadingController; 