const db = require('../database/db');

const teamController = {
  createTeam: async (req, res) => {
    const { name, members, crew_commander_id } = req.body;
    
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({ 
        message: 'Invalid team data. Name and members array are required.' 
      });
    }
    
    try {
      console.log('Creating team:', { name, members, crew_commander_id });
      
      // Create the team
      const [result] = await db.query(
        'INSERT INTO teams (name, crew_commander_id) VALUES (?, ?)',
        [name, crew_commander_id || null]
      );
      
      const teamId = result.insertId;
      console.log('Team created with ID:', teamId);
      
      // Add team members
      for (const memberId of members) {
        await db.query(
          'INSERT INTO team_members (team_id, staff_id) VALUES (?, ?)',
          [teamId, memberId]
        );
      }
      
      // Get the created team with members
      const [team] = await db.query(`
        SELECT t.*, 
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', s.id,
              'name', s.name,
              'role', s.role,
              'photo_url', s.photo_url,
              'empl_no', s.empl_no,
              'id_no', s.id_no,
              'status', s.status
            )
          ) as members
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        LEFT JOIN staff s ON tm.staff_id = s.id
        WHERE t.id = ?
        GROUP BY t.id
      `, [teamId]);
      
      // Parse the members JSON string
      team[0].members = JSON.parse(team[0].members);
      
      console.log('Team created successfully:', team[0]);
      res.status(201).json(team[0]);
    } catch (error) {
      console.error('Error creating team:', error);
      res.status(500).json({ 
        message: 'Error creating team',
        error: error.message 
      });
    }
  },

  getTeams: async (req, res) => {
    try {
      const [teams] = await db.query(`
        SELECT t.*, 
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', s.id,
              'name', s.name,
              'role', s.role,
              'photo_url', s.photo_url,
              'empl_no', s.empl_no,
              'id_no', s.id_no,
              'status', s.status
            )
          ) as members,
          JSON_OBJECT(
            'id', cc.id,
            'name', cc.name,
            'role', cc.role,
            'photo_url', cc.photo_url,
            'empl_no', cc.empl_no,
            'id_no', cc.id_no,
            'status', cc.status
          ) as crew_commander
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        LEFT JOIN staff s ON tm.staff_id = s.id
        LEFT JOIN staff cc ON t.crew_commander_id = cc.id
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `);
      
      // Parse the members JSON string for each team
      teams.forEach(team => {
        team.members = JSON.parse(team.members);
        if (team.crew_commander) {
          team.crew_commander = JSON.parse(team.crew_commander);
        }
      });
      
      res.json(teams);
    } catch (error) {
      console.error('Error fetching teams:', error);
      res.status(500).json({ message: 'Error fetching teams' });
    }
  },

  // Get team by ID with crew commander details
  getTeamById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [teams] = await db.query(`
        SELECT t.*, 
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', s.id,
              'name', s.name,
              'role', s.role,
              'photo_url', s.photo_url,
              'empl_no', s.empl_no,
              'id_no', s.id_no,
              'status', s.status
            )
          ) as members,
          JSON_OBJECT(
            'id', cc.id,
            'name', cc.name,
            'role', cc.role,
            'photo_url', cc.photo_url,
            'empl_no', cc.empl_no,
            'id_no', cc.id_no,
            'status', cc.status
          ) as crew_commander
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        LEFT JOIN staff s ON tm.staff_id = s.id
        LEFT JOIN staff cc ON t.crew_commander_id = cc.id
        WHERE t.id = ?
        GROUP BY t.id
      `, [id]);
      
      if (teams.length === 0) {
        return res.status(404).json({ message: 'Team not found' });
      }
      
      // Parse the members JSON string
      teams[0].members = JSON.parse(teams[0].members);
      if (teams[0].crew_commander) {
        teams[0].crew_commander = JSON.parse(teams[0].crew_commander);
      }
      
      res.json(teams[0]);
    } catch (error) {
      console.error('Error fetching team:', error);
      res.status(500).json({ message: 'Error fetching team' });
    }
  }
};

module.exports = teamController; 