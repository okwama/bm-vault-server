const db = require('../database/db');

const clientUpdateController = {
  // Get client update history for a specific client
  getClientUpdates: async (req, res) => {
    try {
      const { clientId } = req.params;
      console.log('Fetching client updates for client ID:', clientId);

      const [updates] = await db.query(`
        SELECT cu.*, 
          b.name as branch_name,
          t.name as team_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN branches b ON cu.branch_id = b.id
        LEFT JOIN teams t ON cu.team_id = t.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ?
        ORDER BY cu.created_at DESC
      `, [clientId]);

      console.log(`Found ${updates.length} client updates`);
      res.json(updates);
    } catch (error) {
      console.error('Error fetching client updates:', error);
      res.status(500).json({ 
        message: 'Failed to fetch client updates',
        error: error.message 
      });
    }
  },

  // Get client balance certificate for a specific date
  getClientBalanceCertificate: async (req, res) => {
    try {
      const { clientId } = req.params;
      const { date } = req.query;
      
      console.log('Generating balance certificate for client ID:', clientId, 'date:', date);

      if (!date) {
        return res.status(400).json({ message: 'Date parameter is required' });
      }

      // Get client details
      const [clients] = await db.query(
        'SELECT * FROM clients WHERE id = ?',
        [clientId]
      );

      if (clients.length === 0) {
        return res.status(404).json({ message: 'Client not found' });
      }

      const client = clients[0];

      // Get all client updates up to the selected date
      const [allUpdates] = await db.query(`
        SELECT cu.*, 
          b.name as branch_name,
          t.name as team_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN branches b ON cu.branch_id = b.id
        LEFT JOIN teams t ON cu.team_id = t.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ? AND DATE(cu.created_at) <= ?
        ORDER BY cu.created_at ASC
      `, [clientId, date]);

      // Calculate previous day's closing balance
      const prevDay = new Date(date);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().slice(0, 10);

      const [prevDayUpdates] = await db.query(`
        SELECT cu.*, 
          b.name as branch_name,
          t.name as team_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN branches b ON cu.branch_id = b.id
        LEFT JOIN teams t ON cu.team_id = t.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ? AND DATE(cu.created_at) <= ?
        ORDER BY cu.created_at ASC
      `, [clientId, prevDayStr]);

      // Calculate previous day's closing balance as difference between total credits and debits up to that date
      const totalCreditsPrevDay = prevDayUpdates
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const totalDebitsPrevDay = prevDayUpdates
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const prevClosingBalance = totalCreditsPrevDay - totalDebitsPrevDay;

      // Calculate previous day's closing denominations
      const sumPrevDayDenoms = (transactions) => {
        const result = {
          ones: 0, fives: 0, tens: 0, twenties: 0, forties: 0,
          fifties: 0, hundreds: 0, twoHundreds: 0, fiveHundreds: 0, thousands: 0
        };
        transactions.forEach(t => {
          if (t.type === 'credit') {
            result.ones += Number(t.ones || 0);
            result.fives += Number(t.fives || 0);
            result.tens += Number(t.tens || 0);
            result.twenties += Number(t.twenties || 0);
            result.forties += Number(t.forties || 0);
            result.fifties += Number(t.fifties || 0);
            result.hundreds += Number(t.hundreds || 0);
            result.twoHundreds += Number(t.twoHundreds || 0);
            result.fiveHundreds += Number(t.fiveHundreds || 0);
            result.thousands += Number(t.thousands || 0);
          } else if (t.type === 'debit') {
            result.ones -= Number(t.ones || 0);
            result.fives -= Number(t.fives || 0);
            result.tens -= Number(t.tens || 0);
            result.twenties -= Number(t.twenties || 0);
            result.forties -= Number(t.forties || 0);
            result.fifties -= Number(t.fifties || 0);
            result.hundreds -= Number(t.hundreds || 0);
            result.twoHundreds -= Number(t.twoHundreds || 0);
            result.fiveHundreds -= Number(t.fiveHundreds || 0);
            result.thousands -= Number(t.thousands || 0);
          }
        });
        return result;
      };

      const prevClosingDenoms = sumPrevDayDenoms(prevDayUpdates);

      // Get transactions for the selected date
      const [dateTransactions] = await db.query(`
        SELECT cu.*, 
          b.name as branch_name,
          t.name as team_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN branches b ON cu.branch_id = b.id
        LEFT JOIN teams t ON cu.team_id = t.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ? AND DATE(cu.created_at) = ?
        ORDER BY cu.created_at ASC
      `, [clientId, date]);

      // Calculate totals for the date
      const dateCredits = dateTransactions.filter(t => t.type === 'credit');
      const dateDebits = dateTransactions.filter(t => t.type === 'debit');

      const dateCreditsTotal = dateCredits.reduce((sum, t) => sum + Number(t.amount), 0);
      const dateDebitsTotal = dateDebits.reduce((sum, t) => sum + Number(t.amount), 0);

      // Calculate denomination totals for the date
      const sumDenoms = (transactions) => {
        const result = {
          ones: 0, fives: 0, tens: 0, twenties: 0, forties: 0,
          fifties: 0, hundreds: 0, twoHundreds: 0, fiveHundreds: 0, thousands: 0
        };
        transactions.forEach(t => {
          result.ones += Number(t.ones || 0);
          result.fives += Number(t.fives || 0);
          result.tens += Number(t.tens || 0);
          result.twenties += Number(t.twenties || 0);
          result.forties += Number(t.forties || 0);
          result.fifties += Number(t.fifties || 0);
          result.hundreds += Number(t.hundreds || 0);
          result.twoHundreds += Number(t.twoHundreds || 0);
          result.fiveHundreds += Number(t.fiveHundreds || 0);
          result.thousands += Number(t.thousands || 0);
        });
        return result;
      };

      const dateCreditsDenoms = sumDenoms(dateCredits);
      const dateDebitsDenoms = sumDenoms(dateDebits);

      // Get closing balance for the date
      const [closingUpdate] = await db.query(`
        SELECT cu.*, 
          b.name as branch_name,
          t.name as team_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN branches b ON cu.branch_id = b.id
        LEFT JOIN teams t ON cu.team_id = t.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ? AND DATE(cu.created_at) <= ?
        ORDER BY cu.created_at DESC
        LIMIT 1
      `, [clientId, date]);

      // Calculate closing balance as difference between total credits and debits up to the selected date
      const allTransactionsUpToDate = allUpdates;
      const totalCreditsUpToDate = allTransactionsUpToDate
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const totalDebitsUpToDate = allTransactionsUpToDate
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const closingBalance = totalCreditsUpToDate - totalDebitsUpToDate;

      // Calculate closing denominations by summing all transactions up to the selected date
      const sumAllDenoms = (transactions) => {
        const result = {
          ones: 0, fives: 0, tens: 0, twenties: 0, forties: 0,
          fifties: 0, hundreds: 0, twoHundreds: 0, fiveHundreds: 0, thousands: 0
        };
        transactions.forEach(t => {
          if (t.type === 'credit') {
            result.ones += Number(t.ones || 0);
            result.fives += Number(t.fives || 0);
            result.tens += Number(t.tens || 0);
            result.twenties += Number(t.twenties || 0);
            result.forties += Number(t.forties || 0);
            result.fifties += Number(t.fifties || 0);
            result.hundreds += Number(t.hundreds || 0);
            result.twoHundreds += Number(t.twoHundreds || 0);
            result.fiveHundreds += Number(t.fiveHundreds || 0);
            result.thousands += Number(t.thousands || 0);
          } else if (t.type === 'debit') {
            result.ones -= Number(t.ones || 0);
            result.fives -= Number(t.fives || 0);
            result.tens -= Number(t.tens || 0);
            result.twenties -= Number(t.twenties || 0);
            result.forties -= Number(t.forties || 0);
            result.fifties -= Number(t.fifties || 0);
            result.hundreds -= Number(t.hundreds || 0);
            result.twoHundreds -= Number(t.twoHundreds || 0);
            result.fiveHundreds -= Number(t.fiveHundreds || 0);
            result.thousands -= Number(t.thousands || 0);
          }
        });
        return result;
      };

      const closingDenoms = sumAllDenoms(allTransactionsUpToDate);

      const certificate = {
        client,
        selectedDate: date,
        prevClosingBalance,
        prevClosingDenoms,
        dateCredits,
        dateDebits,
        dateCreditsTotal,
        dateDebitsTotal,
        dateCreditsDenoms,
        dateDebitsDenoms,
        closingBalance,
        closingDenoms,
        dateTransactions
      };

      console.log('Balance certificate generated successfully');
      res.json(certificate);
    } catch (error) {
      console.error('Error generating balance certificate:', error);
      res.status(500).json({ 
        message: 'Failed to generate balance certificate',
        error: error.message 
      });
    }
  },

  // Get current client balance
  getClientBalance: async (req, res) => {
    try {
      const { clientId } = req.params;
      console.log('Fetching current balance for client ID:', clientId);

      const [allUpdates] = await db.query(`
        SELECT cu.*, 
          b.name as branch_name,
          t.name as team_name,
          a.atm_code,
          a.location as atm_location
        FROM client_update cu
        LEFT JOIN branches b ON cu.branch_id = b.id
        LEFT JOIN teams t ON cu.team_id = t.id
        LEFT JOIN atms a ON cu.atm_id = a.id
        WHERE cu.client_id = ?
        ORDER BY cu.created_at DESC
      `, [clientId]);

      // Calculate current balance as difference between total credits and debits
      const totalCredits = allUpdates
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const totalDebits = allUpdates
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const currentBalance = totalCredits - totalDebits;

      // Calculate current denominations by summing all transactions
      const sumAllDenoms = (transactions) => {
        const result = {
          ones: 0, fives: 0, tens: 0, twenties: 0, forties: 0,
          fifties: 0, hundreds: 0, twoHundreds: 0, fiveHundreds: 0, thousands: 0
        };
        transactions.forEach(t => {
          if (t.type === 'credit') {
            result.ones += Number(t.ones || 0);
            result.fives += Number(t.fives || 0);
            result.tens += Number(t.tens || 0);
            result.twenties += Number(t.twenties || 0);
            result.forties += Number(t.forties || 0);
            result.fifties += Number(t.fifties || 0);
            result.hundreds += Number(t.hundreds || 0);
            result.twoHundreds += Number(t.twoHundreds || 0);
            result.fiveHundreds += Number(t.fiveHundreds || 0);
            result.thousands += Number(t.thousands || 0);
          } else if (t.type === 'debit') {
            result.ones -= Number(t.ones || 0);
            result.fives -= Number(t.fives || 0);
            result.tens -= Number(t.tens || 0);
            result.twenties -= Number(t.twenties || 0);
            result.forties -= Number(t.forties || 0);
            result.fifties -= Number(t.fifties || 0);
            result.hundreds -= Number(t.hundreds || 0);
            result.twoHundreds -= Number(t.twoHundreds || 0);
            result.fiveHundreds -= Number(t.fiveHundreds || 0);
            result.thousands -= Number(t.thousands || 0);
          }
        });
        return result;
      };

      const currentDenoms = sumAllDenoms(allUpdates);

      res.json({
        currentBalance,
        currentDenoms,
        lastUpdate: allUpdates[0] || null
      });
    } catch (error) {
      console.error('Error fetching client balance:', error);
      res.status(500).json({ 
        message: 'Failed to fetch client balance',
        error: error.message 
      });
    }
  }
};

module.exports = clientUpdateController; 