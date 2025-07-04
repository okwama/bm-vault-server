const db = require('../database/db');

const cashProcessingController = {
  // Create cash processing record
  createCashProcessing: async (req, res) => {
    try {
      const {
        cash_count_id,
        request_id,
        expected_total,
        processed_total,
        difference,
        matched,
        expected_denominations,
        processed_denominations,
        comment
      } = req.body;

      // Validate required fields
      if (!cash_count_id || !request_id || expected_total === undefined || processed_total === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Insert cash processing record
      const [result] = await db.query(`
        INSERT INTO cash_processing (
          cash_count_id, request_id, expected_total, processed_total, difference, matched,
          expected_ones, expected_fives, expected_tens, expected_twenties, expected_forties, 
          expected_fifties, expected_hundreds, expected_twoHundreds, expected_fiveHundreds, expected_thousands,
          processed_ones, processed_fives, processed_tens, processed_twenties, processed_forties,
          processed_fifties, processed_hundreds, processed_twoHundreds, processed_fiveHundreds, processed_thousands,
          comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        cash_count_id, request_id, expected_total, processed_total, difference, matched,
        expected_denominations.ones || 0, expected_denominations.fives || 0, expected_denominations.tens || 0,
        expected_denominations.twenties || 0, expected_denominations.forties || 0, expected_denominations.fifties || 0,
        expected_denominations.hundreds || 0, expected_denominations.twoHundreds || 0, expected_denominations.fiveHundreds || 0,
        expected_denominations.thousands || 0,
        processed_denominations.ones || 0, processed_denominations.fives || 0, processed_denominations.tens || 0,
        processed_denominations.twenties || 0, processed_denominations.forties || 0, processed_denominations.fifties || 0,
        processed_denominations.hundreds || 0, processed_denominations.twoHundreds || 0, processed_denominations.fiveHundreds || 0,
        processed_denominations.thousands || 0,
        comment
      ]);

      // Fetch the created record
      const [records] = await db.query(
        'SELECT * FROM cash_processing WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json(records[0]);
    } catch (error) {
      console.error('Error creating cash processing record:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Get all cash processing records
  getAllCashProcessing: async (req, res) => {
    try {
      const [records] = await db.query(`
        SELECT cp.*, 
          cc.request_id,
          r.user_name, r.pickup_location, r.delivery_location,
          b.name as branch_name, b.id as branch_id,
          c.name as client_name, c.id as client_id,
          t.name as team_name, t.id as team_id
        FROM cash_processing cp
        LEFT JOIN cash_counts cc ON cp.cash_count_id = cc.id
        LEFT JOIN requests r ON cp.request_id = r.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN teams t ON r.team_id = t.id
        ORDER BY cp.created_at DESC
      `);
      
      // Get team members for each record
      const recordsWithMembers = await Promise.all(
        records.map(async (record) => {
          if (record.team_id) {
            const [members] = await db.query(`
              SELECT s.id, s.name, s.role, s.empl_no, s.photo_url
              FROM team_members tm
              JOIN staff s ON tm.staff_id = s.id
              WHERE tm.team_id = ?
              ORDER BY s.name
            `, [record.team_id]);
            return { ...record, team_members: members };
          }
          return { ...record, team_members: [] };
        })
      );
      
      res.json(recordsWithMembers);
    } catch (error) {
      console.error('Error fetching cash processing records:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Get cash processing record by ID
  getCashProcessingById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [records] = await db.query(`
        SELECT cp.*, 
          cc.request_id,
          r.user_name, r.pickup_location, r.delivery_location,
          b.name as branch_name,
          c.name as client_name,
          t.name as team_name,
          t.id as team_id
        FROM cash_processing cp
        LEFT JOIN cash_counts cc ON cp.cash_count_id = cc.id
        LEFT JOIN requests r ON cp.request_id = r.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN teams t ON r.team_id = t.id
        WHERE cp.id = ?
      `, [id]);
      
      if (records.length === 0) {
        return res.status(404).json({ message: 'Cash processing record not found' });
      }

      // Get team members if team exists
      let teamMembers = [];
      if (records[0].team_id) {
        const [members] = await db.query(`
          SELECT s.id, s.name, s.role, s.empl_no, s.photo_url
          FROM team_members tm
          JOIN staff s ON tm.staff_id = s.id
          WHERE tm.team_id = ?
          ORDER BY s.name
        `, [records[0].team_id]);
        teamMembers = members;
      }

      const result = {
        ...records[0],
        team_members: teamMembers
      };
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching cash processing record:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Get cash processing by cash count ID
  getCashProcessingByCashCountId: async (req, res) => {
    try {
      const { cashCountId } = req.params;
      
      const [records] = await db.query(`
        SELECT cp.*, 
          cc.request_id,
          r.user_name, r.pickup_location, r.delivery_location,
          b.name as branch_name,
          c.name as client_name,
          t.name as team_name,
          t.id as team_id
        FROM cash_processing cp
        LEFT JOIN cash_counts cc ON cp.cash_count_id = cc.id
        LEFT JOIN requests r ON cp.request_id = r.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN teams t ON r.team_id = t.id
        WHERE cp.cash_count_id = ?
        ORDER BY cp.created_at DESC
      `, [cashCountId]);
      
      if (records.length === 0) {
        return res.status(404).json({ message: 'Cash processing record not found for this cash count' });
      }

      // Get team members if team exists
      let teamMembers = [];
      if (records[0].team_id) {
        const [members] = await db.query(`
          SELECT s.id, s.name, s.role, s.empl_no, s.photo_url
          FROM team_members tm
          JOIN staff s ON tm.staff_id = s.id
          WHERE tm.team_id = ?
          ORDER BY s.name
        `, [records[0].team_id]);
        teamMembers = members;
      }

      const result = {
        ...records[0],
        team_members: teamMembers
      };
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching cash processing by cash count ID:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

module.exports = cashProcessingController; 