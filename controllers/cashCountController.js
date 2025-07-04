const db = require('../database/db');

const cashCountController = {
  // Get all cash counts
  getAllCashCounts: async (req, res) => {
    try {
      const [cashCounts] = await db.query(`
        SELECT cc.id, cc.request_id, cc.ones, cc.fives, cc.tens, cc.twenties, 
               cc.forties, cc.fifties, cc.hundreds, cc.twoHundreds, cc.fiveHundreds, 
               cc.thousands, cc.created_at, cc.status as cash_count_status,
          r.user_name, r.pickup_location, r.delivery_location, r.status as request_status,
          b.name as branch_name, b.id as branch_id,
          c.name as client_name, c.id as client_id,
          t.name as team_name,
          t.id as team_id
        FROM cash_counts cc
        LEFT JOIN requests r ON cc.request_id = r.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN teams t ON r.team_id = t.id
        ORDER BY cc.created_at DESC
      `);
      
      // Get team members for each cash count
      const cashCountsWithMembers = await Promise.all(
        cashCounts.map(async (cashCount) => {
          if (cashCount.team_id) {
            const [members] = await db.query(`
              SELECT s.id, s.name, s.role, s.empl_no, s.photo_url
              FROM team_members tm
              JOIN staff s ON tm.staff_id = s.id
              WHERE tm.team_id = ?
              ORDER BY s.name
            `, [cashCount.team_id]);
            return { ...cashCount, team_members: members };
          }
          return { ...cashCount, team_members: [] };
        })
      );
      
      res.json(cashCountsWithMembers);
    } catch (error) {
      console.error('Error fetching cash counts:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Get cash count by ID
  getCashCountById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [cashCounts] = await db.query(`
        SELECT cc.id, cc.request_id, cc.ones, cc.fives, cc.tens, cc.twenties, 
               cc.forties, cc.fifties, cc.hundreds, cc.twoHundreds, cc.fiveHundreds, 
               cc.thousands, cc.created_at, cc.status as cash_count_status,
          r.user_name, r.pickup_location, r.delivery_location, r.status as request_status,
          b.name as branch_name,
          c.name as client_name,
          t.name as team_name,
          t.id as team_id
        FROM cash_counts cc
        LEFT JOIN requests r ON cc.request_id = r.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN teams t ON r.team_id = t.id
        WHERE cc.id = ?
      `, [id]);
      
      if (cashCounts.length === 0) {
        return res.status(404).json({ message: 'Cash count not found' });
      }

      // Get team members if team exists
      let teamMembers = [];
      if (cashCounts[0].team_id) {
        const [members] = await db.query(`
          SELECT s.id, s.name, s.role, s.empl_no, s.photo_url
          FROM team_members tm
          JOIN staff s ON tm.staff_id = s.id
          WHERE tm.team_id = ?
          ORDER BY s.name
        `, [cashCounts[0].team_id]);
        teamMembers = members;
      }

      const result = {
        ...cashCounts[0],
        team_members: teamMembers
      };
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching cash count:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Get cash count by request ID
  getCashCountByRequestId: async (req, res) => {
    try {
      const { requestId } = req.params;
      
      const [cashCounts] = await db.query(`
        SELECT cc.id, cc.request_id, cc.ones, cc.fives, cc.tens, cc.twenties, 
               cc.forties, cc.fifties, cc.hundreds, cc.twoHundreds, cc.fiveHundreds, 
               cc.thousands, cc.created_at, cc.status as cash_count_status,
          r.user_name, r.pickup_location, r.delivery_location, r.status as request_status,
          b.name as branch_name,
          c.name as client_name,
          t.name as team_name,
          t.id as team_id
        FROM cash_counts cc
        LEFT JOIN requests r ON cc.request_id = r.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN teams t ON r.team_id = t.id
        WHERE cc.request_id = ?
      `, [requestId]);
      
      if (cashCounts.length === 0) {
        return res.status(404).json({ message: 'Cash count not found for this request' });
      }

      // Get team members if team exists
      let teamMembers = [];
      if (cashCounts[0].team_id) {
        const [members] = await db.query(`
          SELECT s.id, s.name, s.role, s.empl_no, s.photo_url
          FROM team_members tm
          JOIN staff s ON tm.staff_id = s.id
          WHERE tm.team_id = ?
          ORDER BY s.name
        `, [cashCounts[0].team_id]);
        teamMembers = members;
      }

      const result = {
        ...cashCounts[0],
        team_members: teamMembers
      };
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching cash count by request ID:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Create new cash count
  createCashCount: async (req, res) => {
    try {
      const {
        request_id,
        ones = 0,
        fives = 0,
        tens = 0,
        twenties = 0,
        forties = 0,
        fifties = 0,
        hundreds = 0,
        twoHundreds = 0,
        fiveHundreds = 0,
        thousands = 0
      } = req.body;

      // Validate required fields
      if (!request_id) {
        return res.status(400).json({ message: 'Request ID is required' });
      }

      // Check if request exists
      const [requests] = await db.query(
        'SELECT id FROM requests WHERE id = ?',
        [request_id]
      );

      if (requests.length === 0) {
        return res.status(400).json({ message: 'Invalid request ID' });
      }

      // Check if cash count already exists for this request
      const [existingCounts] = await db.query(
        'SELECT id FROM cash_counts WHERE request_id = ?',
        [request_id]
      );

      if (existingCounts.length > 0) {
        return res.status(400).json({ message: 'Cash count already exists for this request' });
      }

      // Insert new cash count
      const [result] = await db.query(`
        INSERT INTO cash_counts (
          request_id, ones, fives, tens, twenties, forties, fifties, 
          hundreds, twoHundreds, fiveHundreds, thousands
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        request_id, ones, fives, tens, twenties, forties, fifties,
        hundreds, twoHundreds, fiveHundreds, thousands
      ]);

      // Fetch the created cash count
      const [cashCounts] = await db.query(
        'SELECT * FROM cash_counts WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json(cashCounts[0]);
    } catch (error) {
      console.error('Error creating cash count:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Update cash count
  updateCashCount: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        ones,
        fives,
        tens,
        twenties,
        forties,
        fifties,
        hundreds,
        twoHundreds,
        fiveHundreds,
        thousands
      } = req.body;

      // Check if cash count exists
      const [existingCounts] = await db.query(
        'SELECT id FROM cash_counts WHERE id = ?',
        [id]
      );

      if (existingCounts.length === 0) {
        return res.status(404).json({ message: 'Cash count not found' });
      }

      // Build update query dynamically
      const updates = {};
      if (ones !== undefined) updates.ones = ones;
      if (fives !== undefined) updates.fives = fives;
      if (tens !== undefined) updates.tens = tens;
      if (twenties !== undefined) updates.twenties = twenties;
      if (forties !== undefined) updates.forties = forties;
      if (fifties !== undefined) updates.fifties = fifties;
      if (hundreds !== undefined) updates.hundreds = hundreds;
      if (twoHundreds !== undefined) updates.twoHundreds = twoHundreds;
      if (fiveHundreds !== undefined) updates.fiveHundreds = fiveHundreds;
      if (thousands !== undefined) updates.thousands = thousands;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      const setClause = Object.keys(updates)
        .map(key => `${key} = ?`)
        .join(', ');
      
      const values = [...Object.values(updates), id];

      await db.query(
        `UPDATE cash_counts SET ${setClause} WHERE id = ?`,
        values
      );

      // Fetch the updated cash count
      const [cashCounts] = await db.query(
        'SELECT * FROM cash_counts WHERE id = ?',
        [id]
      );

      res.json(cashCounts[0]);
    } catch (error) {
      console.error('Error updating cash count:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // Delete cash count
  deleteCashCount: async (req, res) => {
    try {
      const { id } = req.params;

      const [result] = await db.query(
        'DELETE FROM cash_counts WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Cash count not found' });
      }

      res.json({ message: 'Cash count deleted successfully' });
    } catch (error) {
      console.error('Error deleting cash count:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

module.exports = cashCountController; 