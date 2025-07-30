// hash-password.js
import bcrypt from 'bcryptjs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter your admin password: ', async (plainPassword) => {
  try {
    const saltRounds = 12;
    const hash = await bcrypt.hash(plainPassword, saltRounds);
    console.log('\n✅ Use this hash in your .env file as ADMIN_PASSWORD_HASH:\n');
    console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
  } catch (err) {
    console.error('❌ Error generating hash:', err);
  } finally {
    rl.close();
  }
});
