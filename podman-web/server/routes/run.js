const express = require('express');
const { exec } = require('child_process');

const router = express.Router();

router.post('/run', (req, res) => {
  const command = req.body?.command ?? 'podman run --rm hello-world';

  exec(command, { timeout: 120_000 }, (error, stdout, stderr) => {
    res.json({
      output: stdout + stderr,
      exitCode: error ? (error.code ?? 1) : 0,
    });
  });
});

module.exports = router;
