const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database/db');
const staffController = require('./controllers/staffController');
const roleController = require('./controllers/roleController');
const { upload } = require('./config/cloudinary');
const uploadController = require('./controllers/uploadController');
const teamController = require('./controllers/teamController');
const clientController = require('./controllers/clientController');
const branchController = require('./controllers/branchController');
const atmController = require('./controllers/atmController');
const serviceChargeController = require('./controllers/serviceChargeController');
const noticeController = require('./controllers/noticeController');
const cashCountController = require('./controllers/cashCountController');
const vaultController = require('./controllers/vaultController');
const cashProcessingController = require('./controllers/cashProcessingController');
const clientUpdateController = require('./controllers/clientUpdateController');
const atmLoadingTableController = require('./controllers/atmLoadingTableController');
require('dotenv').config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    'https://bm-vault-client.vercel.app',
    'https://vault-client.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Helper function to map database fields to frontend fields
const mapRequestFields = (request) => ({
  id: request.id,
  userId: request.user_id,
  userName: request.user_name,
  serviceTypeId: request.service_type_id,
  pickupLocation: request.pickup_location,
  deliveryLocation: request.delivery_location,
  pickupDate: request.pickup_date,
  description: request.description,
  priority: request.priority,
  status: request.status,
  myStatus: request.my_status,
  branchId: request.branch_id,
  branchName: request.branch_name,
  clientId: request.client_id,
  teamId: request.team_id,
  staffId: request.staff_id,
  price: request.price,
  latitude: request.latitude,
  longitude: request.longitude,
  createdAt: request.created_at,
  updatedAt: request.updated_at
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt received:', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Get user from database
    console.log('Querying database for user:', username);
    const [users] = await db.query(
      'SELECT * FROM vault_users WHERE username = ?',
      [username]
    );

    console.log('Database query result:', users);

    if (users.length === 0) {
      console.log('No user found with username:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    // Compare password
    console.log('Comparing passwords...');
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    console.log('Creating JWT token for user:', username);
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', username);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Service Types routes
app.get('/api/service-types', async (req, res) => {
  try {
    const [serviceTypes] = await db.query(
      'SELECT * FROM service_types ORDER BY name'
    );
    res.json(serviceTypes);
  } catch (error) {
    console.error('Error fetching service types:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/service-types/:id', async (req, res) => {
  try {
    const [serviceTypes] = await db.query(
      'SELECT * FROM service_types WHERE id = ?',
      [req.params.id]
    );

    if (serviceTypes.length === 0) {
      return res.status(404).json({ message: 'Service type not found' });
    }

    res.json(serviceTypes[0]);
  } catch (error) {
    console.error('Error fetching service type:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Requests routes
app.get('/api/requests', async (req, res) => {
  try {
    const { status, myStatus } = req.query;
    let query = `
      SELECT r.*, b.name as branch_name 
      FROM requests r
      LEFT JOIN branches b ON r.branch_id = b.id
    `;
    const params = [];

    // Add filters if provided
    if (status || myStatus !== undefined) {
      query += ' WHERE';
      if (status) {
        query += ' r.status = ?';
        params.push(status);
      }
      if (myStatus !== undefined) {
        if (status) query += ' AND';
        query += ' r.my_status = ?';
        params.push(myStatus);
      }
    }

    query += ' ORDER BY r.created_at DESC';
    
    const [requests] = await db.query(query, params);
    res.json(requests.map(mapRequestFields));
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [requests] = await db.query(`
      SELECT r.*, b.name as branch_name, b.client_id
      FROM requests r
      LEFT JOIN branches b ON r.branch_id = b.id
      WHERE r.id = ?
    `, [id]);

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error fetching request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const { 
      userId, 
      userName, 
      serviceTypeId,
      pickupLocation, 
      deliveryLocation, 
      pickupDate, 
      description, 
      priority,
      myStatus = 0,
      branchId,
      teamId,
      staffId,
      atmId,
      price,
      latitude,
      longitude
    } = req.body;

    console.log('Received request data:', {
      userId,
      userName,
      serviceTypeId,
      pickupLocation,
      deliveryLocation,
      pickupDate,
      description,
      priority,
      myStatus,
      branchId,
      teamId,
      staffId,
      atmId,
      price,
      latitude,
      longitude
    });

    // Validate required fields
    if (!userId || !userName || !serviceTypeId || !pickupLocation || !deliveryLocation || !pickupDate || !branchId || !price) {
      console.log('Missing required fields:', {
        userId: !userId,
        userName: !userName,
        serviceTypeId: !serviceTypeId,
        pickupLocation: !pickupLocation,
        deliveryLocation: !deliveryLocation,
        pickupDate: !pickupDate,
        branchId: !branchId,
        price: !price
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if service type exists
    const [serviceTypes] = await db.query(
      'SELECT id FROM service_types WHERE id = ?',
      [serviceTypeId]
    );

    if (serviceTypes.length === 0) {
      console.error('Service type not found:', serviceTypeId);
      return res.status(400).json({ message: 'Invalid service type' });
    }

    // Check if user exists
    const [users] = await db.query(
      'SELECT id FROM vault_users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      console.error('User not found:', userId);
      return res.status(400).json({ message: 'Invalid user' });
    }

    // Check if branch exists
    const [branches] = await db.query(
      'SELECT id FROM branches WHERE id = ?',
      [branchId]
    );

    if (branches.length === 0) {
      console.error('Branch not found:', branchId);
      return res.status(400).json({ message: 'Invalid branch' });
    }

    // Check if ATM exists (if atmId is provided)
    if (atmId) {
      const [atms] = await db.query(
        'SELECT id FROM atms WHERE id = ?',
        [atmId]
      );

      if (atms.length === 0) {
        console.error('ATM not found:', atmId);
        return res.status(400).json({ message: 'Invalid ATM' });
      }
    }

    // Insert the request with price, coordinates, and ATM ID
    const [result] = await db.query(
      `INSERT INTO requests (
        user_id, user_name, service_type_id, branch_id, team_id, staff_id, atm_id,
        pickup_location, delivery_location, pickup_date, 
        description, priority, status, my_status, price,
        latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, userName, serviceTypeId, branchId, teamId || null, staffId || null, atmId || null,
        pickupLocation, deliveryLocation, pickupDate,
        description || null, priority || 'medium', 'pending', myStatus, price,
        latitude || null, longitude || null
      ]
    );

    // Fetch the created request
    const [requests] = await db.query(
      'SELECT * FROM requests WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ message: 'Error creating request', error: error.message });
  }
});

app.patch('/api/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If teamId is being updated, fetch the crew_commander_id from the team
    let staffIdToUpdate = updates.staffId;
    if (updates.teamId) {
      try {
        const [teamRows] = await db.query(
          'SELECT crew_commander_id FROM teams WHERE id = ?',
          [updates.teamId]
        );
        
        if (teamRows.length > 0 && teamRows[0].crew_commander_id) {
          staffIdToUpdate = teamRows[0].crew_commander_id;
          console.log(`Auto-assigning crew commander ID ${staffIdToUpdate} for team ${updates.teamId}`);
        } else {
          console.log(`Warning: Team ${updates.teamId} has no crew commander assigned`);
        }
      } catch (error) {
        console.error('Error fetching crew commander ID:', error);
        // Continue with the original staffId if there's an error
      }
    }

    // Map frontend field names to database field names
    const dbUpdates = {
      user_name: updates.userName,
      service_type_id: updates.serviceTypeId,
      pickup_location: updates.pickupLocation,
      delivery_location: updates.deliveryLocation,
      pickup_date: updates.pickupDate,
      description: updates.description,
      priority: updates.priority,
      status: updates.status,
      my_status: updates.myStatus,
      team_id: updates.teamId,
      staff_id: staffIdToUpdate,
      atm_id: updates.atmId,
      latitude: updates.latitude,
      longitude: updates.longitude
    };

    // Remove undefined values
    Object.keys(dbUpdates).forEach(key => 
      dbUpdates[key] === undefined && delete dbUpdates[key]
    );

    // Build the SET clause dynamically based on provided updates
    const setClause = Object.keys(dbUpdates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = [...Object.values(dbUpdates), id];

    await db.query(
      `UPDATE requests SET ${setClause} WHERE id = ?`,
      values
    );

    // Get the updated request
    const [requests] = await db.query(
      'SELECT * FROM requests WHERE id = ?',
      [id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Requests routes
app.get('/api/runs/summaries', async (req, res) => {
  try {
    const { year, month, clientId, branchId } = req.query;
    let query = `
      SELECT 
        DATE(pickup_date) as date,
        COUNT(*) as totalRuns,
        SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END) as totalAmount
      FROM requests r
      LEFT JOIN branches b ON r.branch_id = b.id
      WHERE r.my_status = 3
    `;
    const params = [];

    if (year) {
      query += ' AND YEAR(r.pickup_date) = ?';
      params.push(year);
    }

    if (month) {
      query += ' AND MONTH(r.pickup_date) = ?';
      params.push(month);
    }

    if (clientId) {
      query += ' AND b.client_id = ?';
      params.push(clientId);
    }

    if (branchId) {
      query += ' AND r.branch_id = ?';
      params.push(branchId);
    }

    query += `
      GROUP BY DATE(r.pickup_date)
      ORDER BY date DESC
    `;

    const [summaries] = await db.query(query, params);
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching run summaries:', error);
    res.status(500).json({ message: 'Error fetching run summaries', error: error.message });
  }
});

// Staff routes
app.get('/api/staff', staffController.getAllStaff);
app.get('/api/staff/:id', staffController.getStaffById);
app.post('/api/staff', staffController.createStaff);
app.put('/api/staff/:id', staffController.updateStaff);
app.delete('/api/staff/:id', staffController.deleteStaff);
app.put('/api/staff/:id/status', staffController.updateStaffStatus);

// Roles routes
app.get('/api/roles', roleController.getAllRoles);

// Upload routes
app.post('/api/upload', upload.single('photo'), uploadController.uploadImage);

// Team routes
app.post('/api/teams', teamController.createTeam);
app.get('/api/teams', teamController.getTeams);
app.get('/api/teams/:id', teamController.getTeamById);

// Client routes
app.get('/api/clients', clientController.getAllClients);
app.get('/api/clients/:id', clientController.getClient);
app.post('/api/clients', clientController.createClient);
app.put('/api/clients/:id', clientController.updateClient);
app.delete('/api/clients/:id', clientController.deleteClient);
app.get('/api/branches', branchController.getAllBranchesWithoutClient);
app.get('/api/clients/:clientId/branches', branchController.getAllBranches);
app.post('/api/clients/:clientId/branches', branchController.createBranch);
app.put('/api/clients/:clientId/branches/:branchId', branchController.updateBranch);
app.delete('/api/clients/:clientId/branches/:branchId', branchController.deleteBranch);
app.get('/api/clients/:clientId/service-charges', serviceChargeController.getServiceCharges);
app.post('/api/clients/:clientId/service-charges', serviceChargeController.createServiceCharge);
app.put('/api/clients/:clientId/service-charges/:chargeId', serviceChargeController.updateServiceCharge);
app.delete('/api/clients/:clientId/service-charges/:chargeId', serviceChargeController.deleteServiceCharge);

// ATM routes
app.get('/api/clients/:clientId/atms', atmController.getAllATMs);
app.post('/api/clients/:clientId/atms', atmController.createATM);
app.put('/api/clients/:clientId/atms/:atmId', atmController.updateATM);
app.delete('/api/clients/:clientId/atms/:atmId', atmController.deleteATM);

// Notice routes
app.get('/api/notices', noticeController.getNotices);
app.post('/api/notices', noticeController.createNotice);
app.patch('/api/notices/:id', noticeController.updateNotice);
app.delete('/api/notices/:id', noticeController.deleteNotice);
app.patch('/api/notices/:id/status', noticeController.toggleNoticeStatus);

// Cash Count routes
app.get('/api/cash-counts', cashCountController.getAllCashCounts);
app.get('/api/cash-counts/:id', cashCountController.getCashCountById);
app.get('/api/requests/:requestId/cash-count', cashCountController.getCashCountByRequestId);
app.post('/api/cash-counts', cashCountController.createCashCount);
app.put('/api/cash-counts/:id', cashCountController.updateCashCount);
app.delete('/api/cash-counts/:id', cashCountController.deleteCashCount);

// Vault routes
app.get('/api/vault/:vaultId/balance', vaultController.getVaultBalance);
app.get('/api/vault/:vaultId/updates', vaultController.getVaultUpdates);
app.post('/api/vault/receive', vaultController.receiveAmount);
app.post('/api/vault/withdraw', vaultController.withdrawAmount);

// Cash Processing routes
app.get('/api/cash-processing', cashProcessingController.getAllCashProcessing);
app.get('/api/cash-processing/:id', cashProcessingController.getCashProcessingById);
app.get('/api/cash-counts/:cashCountId/processing', cashProcessingController.getCashProcessingByCashCountId);
app.post('/api/cash-processing', cashProcessingController.createCashProcessing);

// Client Update routes
app.get('/api/clients/:clientId/updates', clientUpdateController.getClientUpdates);
app.get('/api/clients/:clientId/balance', clientUpdateController.getClientBalance);
app.get('/api/clients/:clientId/balance-certificate', clientUpdateController.getClientBalanceCertificate);

// ATM Loading routes
app.post('/api/atm-loading', atmLoadingTableController.createATMLoading);
app.get('/api/atm-loading', atmLoadingTableController.getAllATMLoading);
app.get('/api/atm-loading/:id', atmLoadingTableController.getATMLoadingById);
app.get('/api/atm-loading/client/:clientId', atmLoadingTableController.getATMLoadingByClient);
app.get('/api/atm-loading/atm/:atmId', atmLoadingTableController.getATMLoadingByATM);
app.put('/api/atm-loading/:id', atmLoadingTableController.updateATMLoading);
app.delete('/api/atm-loading/:id', atmLoadingTableController.deleteATMLoading);

// Example API endpoint
app.get('/api/test', (req, res) => {
  db.query('SELECT 1 + 1 AS solution')
    .then(([results]) => {
      res.json({ message: 'Database connection successful', results });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});
app.get('/',(req, res) => {
  res.send('API IS WORKING');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 
