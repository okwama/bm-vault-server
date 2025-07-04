const db = require('./database/db');

async function createATMLoadingTable() {
  try {
    console.log('Creating atm_loading table...');
    
    // Create atm_loading table
    await db.query(`
      CREATE TABLE IF NOT EXISTS atm_loading (
        id INT PRIMARY KEY AUTO_INCREMENT,
        client_id INT NOT NULL,
        atm_id INT NOT NULL,
        ones INT DEFAULT 0,
        fives INT DEFAULT 0,
        tens INT DEFAULT 0,
        twenties INT DEFAULT 0,
        forties INT DEFAULT 0,
        fifties INT DEFAULT 0,
        hundreds INT DEFAULT 0,
        twoHundreds INT DEFAULT 0,
        fiveHundreds INT DEFAULT 0,
        thousands INT DEFAULT 0,
        total_amount DECIMAL(15,2) NOT NULL,
        loading_date DATE NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (atm_id) REFERENCES atms(id) ON DELETE CASCADE
      )
    `);
    
    console.log('✅ atm_loading table created successfully');
    
    // Verify the table structure
    const [columns] = await db.query('DESCRIBE atm_loading');
    console.log('\natm_loading table structure:');
    columns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
  } catch (error) {
    console.error('Error creating atm_loading table:', error);
  } finally {
    process.exit(0);
  }
}

createATMLoadingTable(); 