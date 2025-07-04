const db = require('./database/db');

async function createVaultTables() {
  try {
    console.log('Creating vault tables...');
    
    // Check if vault table already exists
    const [vaultTables] = await db.query('SHOW TABLES LIKE "vault"');
    
    if (vaultTables.length === 0) {
      // Create vault table
      await db.query(`
        CREATE TABLE vault (
          id INT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(255) NOT NULL,
          current_balance DECIMAL(15, 2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ vault table created successfully');
    } else {
      console.log('vault table already exists');
    }
    
    // Check if vault_update table already exists
    const [vaultUpdateTables] = await db.query('SHOW TABLES LIKE "vault_update"');
    
    if (vaultUpdateTables.length === 0) {
      // Create vault_update table
      await db.query(`
        CREATE TABLE vault_update (
          id INT PRIMARY KEY AUTO_INCREMENT,
          vault_id INT NOT NULL,
          client_id INT,
          branch_id INT,
          team_id INT,
          amount_in DECIMAL(15, 2) DEFAULT 0.00,
          amount_out DECIMAL(15, 2) DEFAULT 0.00,
          new_balance DECIMAL(15, 2) NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vault_id) REFERENCES vault(id),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
        )
      `);
      console.log('✅ vault_update table created successfully');
    } else {
      console.log('vault_update table already exists');
    }
    
    // Insert initial vault data if it doesn't exist
    const [existingVault] = await db.query('SELECT id FROM vault WHERE id = 1');
    if (existingVault.length === 0) {
      await db.query('INSERT INTO vault (id, name, current_balance) VALUES (1, "Vault 1", 0.00)');
      console.log('✅ Initial vault data inserted');
    } else {
      console.log('Initial vault data already exists');
    }
    
    // Verify the tables were created
    const [tables] = await db.query('SHOW TABLES LIKE "vault%"');
    console.log('\nVault tables created:', tables.map(t => Object.values(t)[0]));
    
    // Show table structures
    const [vaultColumns] = await db.query('DESCRIBE vault');
    console.log('\nVault table structure:');
    vaultColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    const [vaultUpdateColumns] = await db.query('DESCRIBE vault_update');
    console.log('\nVault_update table structure:');
    vaultUpdateColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
  } catch (error) {
    console.error('Error creating vault tables:', error);
  } finally {
    process.exit(0);
  }
}

createVaultTables(); 