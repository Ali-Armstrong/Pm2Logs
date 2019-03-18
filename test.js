/**
 * Created by sys1108 on 25/1/18.
 */
const { spawn } = require('child_process');

options=['-H','google.com']

ls = spawn('whois', options, {detached: true});
//console.log(ls.pid)
ls.stdout.on('data', (res) => {
    console.log(res.toString())
});

ls.stderr.on('data', (res) => {
    console.log(res.toString())
});

ls.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
});

ls.on('error', function (err) {
    log.error("invalid command",err)
});