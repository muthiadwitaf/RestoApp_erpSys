const bcrypt = require('bcrypt');
async function test() {
    const valid = await bcrypt.compare('password123', '$2b$10$FI4/A9IBFcVnGvzUfdiWJ./yDVl4XHaf7aQzpga8q4iy2h4K.fani');
    console.log("Is valid:", valid);
}
test();
