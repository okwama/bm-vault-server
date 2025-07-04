const db = require('./database/db');

async function createClientUpdateTable() {
  try {
    console.log('Creating client_update table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_update (
        id INT PRIMARY KEY AUTO_INCREMENT,
        client_id INT NOT NULL,
        branch_id INT,
        team_id INT,
        type ENUM('credit', 'debit') NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        new_balance DECIMAL(15,2) NOT NULL,
        comment TEXT,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ client_update table created successfully');
    const [columns] = await db.query('DESCRIBE client_update');
    console.log('\nclient_update table structure:');
    columns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
  } catch (error) {
    console.error('Error creating client_update table:', error);
  } finally {
    process.exit(0);
  }
}

createClientUpdateTable(); 