const db = require('../database/db');

const atmController = {
  // Get all ATMs for a specific client
  getAllATMs: async (req, res) => {
    try {
      const { clientId } = req.params;
      console.log('Fetching ATMs for client ID:', clientId);
      
      const [atms] = await db.query(
        'SELECT * FROM atms WHERE client_id = ? ORDER BY created_at DESC',
        [clientId]
      );
      
      console.log('ATMs fetched successfully:', atms);
      res.json(atms);
    } catch (error) {
      console.error('Error fetching ATMs:', error);
      res.status(500).json({ 
        message: 'Error fetching ATMs', 
        error: error.message 
      });
    }
  },

  // Get a specific ATM
  getATM: async (req, res) => {
    try {
      const { id } = req.params;
      console.log('Fetching ATM with ID:', id);
      
      const [atms] = await db.query(
        'SELECT * FROM atms WHERE id = ?',
        [id]
      );
      
      if (atms.length === 0) {
        console.log('ATM not found');
        return res.status(404).json({ message: 'ATM not found' });
      }
      
      console.log('ATM found:', atms[0]);
      res.json(atms[0]);
    } catch (error) {
      console.error('Error fetching ATM:', error);
      res.status(500).json({ 
        message: 'Error fetching ATM', 
        error: error.message 
      });
    }
  },

  // Create a new ATM
  createATM: async (req, res) => {
    try {
      const { clientId } = req.params;
      const { atm_code, location, comment } = req.body;
      
      console.log('Creating ATM for client ID:', clientId, 'Data:', req.body);

      // Validate required fields
      if (!atm_code || !location) {
        return res.status(400).json({ 
          message: 'ATM code and location are required' 
        });
      }

      // Check for duplicate ATM code for the same client
      const [existingATMs] = await db.query(
        'SELECT * FROM atms WHERE atm_code = ? AND client_id = ?',
        [atm_code, clientId]
      );

      if (existingATMs.length > 0) {
        return res.status(400).json({ 
          message: 'ATM code already exists for this client' 
        });
      }

      // Insert new ATM
      const [result] = await db.query(
        'INSERT INTO atms (client_id, atm_code, location, comment) VALUES (?, ?, ?, ?)',
        [clientId, atm_code, location, comment]
      );

      // Fetch the newly created ATM
      const [newATM] = await db.query(
        'SELECT * FROM atms WHERE id = ?',
        [result.insertId]
      );

      console.log('ATM created successfully:', newATM[0]);
      res.status(201).json(newATM[0]);
    } catch (error) {
      console.error('Error creating ATM:', error);
      res.status(500).json({ 
        message: 'Error creating ATM', 
        error: error.message 
      });
    }
  },

  // Update an ATM
  updateATM: async (req, res) => {
    try {
      const { clientId, atmId } = req.params;
      const { atm_code, location, comment } = req.body;
      
      console.log('Updating ATM with ID:', atmId, 'for client ID:', clientId, 'Data:', req.body);

      // Validate required fields
      if (!atm_code || !location) {
        return res.status(400).json({ 
          message: 'ATM code and location are required' 
        });
      }

      // Check for duplicate ATM code for the same client (excluding current ATM)
      const [existingATMs] = await db.query(
        'SELECT * FROM atms WHERE atm_code = ? AND client_id = ? AND id != ?',
        [atm_code, clientId, atmId]
      );

      if (existingATMs.length > 0) {
        return res.status(400).json({ 
          message: 'ATM code already exists for this client' 
        });
      }

      // Update ATM
      await db.query(
        'UPDATE atms SET atm_code = ?, location = ?, comment = ? WHERE id = ? AND client_id = ?',
        [atm_code, location, comment, atmId, clientId]
      );

      // Fetch the updated ATM
      const [updatedATM] = await db.query(
        'SELECT * FROM atms WHERE id = ?',
        [atmId]
      );

      if (updatedATM.length === 0) {
        return res.status(404).json({ message: 'ATM not found' });
      }

      console.log('ATM updated successfully:', updatedATM[0]);
      res.json(updatedATM[0]);
    } catch (error) {
      console.error('Error updating ATM:', error);
      res.status(500).json({ 
        message: 'Error updating ATM', 
        error: error.message 
      });
    }
  },

  // Delete an ATM
  deleteATM: async (req, res) => {
    try {
      const { clientId, atmId } = req.params;
      console.log('Deleting ATM with ID:', atmId, 'for client ID:', clientId);

      // Check if ATM exists and belongs to the client
      const [atm] = await db.query(
        'SELECT * FROM atms WHERE id = ? AND client_id = ?',
        [atmId, clientId]
      );

      if (atm.length === 0) {
        return res.status(404).json({ message: 'ATM not found' });
      }

      // Delete ATM
      await db.query(
        'DELETE FROM atms WHERE id = ? AND client_id = ?',
        [atmId, clientId]
      );
      
      console.log('ATM deleted successfully');
      res.json({ message: 'ATM deleted successfully' });
    } catch (error) {
      console.error('Error deleting ATM:', error);
      res.status(500).json({ 
        message: 'Error deleting ATM', 
        error: error.message 
      });
    }
  }
};

module.exports = atmController; 