const express = require('express');
const path = require('path');
const runRouter = require('./routes/run');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', runRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Podman web server listening on port ${PORT}`);
});
