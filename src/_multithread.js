const cluster = require("cluster");

// Reply protocol (main -> renderer), on channel "systeminformation-reply-<id>":
//  - success: send(channel, result)
//  - failure: send(channel, null, "<error string>")   (the renderer proxy rejects the promise)

if (cluster.isMaster) {
    const electron = require("electron");
    const ipc = electron.ipcMain;
    const signale = require("signale");
    // A single worker is enough to keep the systeminformation calls (and their wmic/powershell/cat spawns)
    // off the main process: the calls are async, so they run concurrently inside it anyway. See #904
    // Single-CPU machines keep the in-process fallback.
    const numWorkers = (require("os").cpus().length > 1) ? 1 : 0;
    const MAX_RESTARTS = 10;
    const STALE_AFTER = 30000;

    const si = require("systeminformation");

    cluster.setupMaster({
        exec: require("path").join(__dirname, "_multithread.js")
    });

    var queue = {};
    let worker = null;
    let restarts = 0;
    let forkedAt = 0;
    let quitting = false;

    electron.app.on("before-quit", () => {
        quitting = true;
    });

    function reply(sender, id, res, err) {
        try {
            if (!sender || (typeof sender.isDestroyed === "function" && sender.isDestroyed())) return;
            if (typeof err !== "undefined") {
                sender.send("systeminformation-reply-"+id, null, String(err));
            } else {
                sender.send("systeminformation-reply-"+id, res);
            }
        } catch(e) {
            // Window has been closed, ignore.
        }
    }

    function failPending(wid, reason) {
        Object.keys(queue).forEach(id => {
            if (wid === null || queue[id].wid === wid) {
                let entry = queue[id];
                delete queue[id];
                reply(entry.sender, id, null, reason);
            }
        });
    }

    function fork() {
        forkedAt = Date.now();
        worker = cluster.fork();
    }

    cluster.on("exit", (w, code, signal) => {
        failPending(w.id, `systeminformation worker exited (${code || signal})`);
        if (worker !== null && worker.id === w.id) worker = null;
        if (quitting) return;

        // Only count crashes happening in a row (the app runs for hours)
        if (Date.now() - forkedAt > 300000) restarts = 0;
        restarts++;
        if (restarts > MAX_RESTARTS) {
            signale.warn("Multithread worker keeps crashing, falling back to in-process systeminformation calls");
            return;
        }
        signale.warn(`Multithread worker ${w.process.pid} exited (${code || signal}), restarting it`);
        setTimeout(() => {
            if (!quitting && worker === null) fork();
        }, 2000);
    });

    for (let i = 0; i < numWorkers; i++) {
        fork();
    }

    signale.success("Multithreaded controller ready");

    // Drop requests that never got an answer (e.g. a hung wmic call): the renderer has already timed out
    setInterval(() => {
        let now = Date.now();
        Object.keys(queue).forEach(id => {
            if (now - queue[id].time > STALE_AFTER) {
                let entry = queue[id];
                delete queue[id];
                reply(entry.sender, id, null, "systeminformation call timed out");
            }
        });
    }, 15000).unref();

    function runInProcess(sender, type, id, args) {
        let p;
        try {
            p = Promise.resolve(si[type](...args));
        } catch(err) {
            p = Promise.reject(err);
        }
        p.then(res => {
            reply(sender, id, res);
        }, err => {
            reply(sender, id, null, err);
        });
    }

    ipc.on("systeminformation-call", (e, type, id, ...args) => {
        if (typeof si[type] !== "function") {
            signale.warn("Illegal request for systeminformation");
            reply(e.sender, id, null, `Illegal request for systeminformation (${type})`);
            return;
        }

        if (args.length > 1 || worker === null || !worker.isConnected()) {
            runInProcess(e.sender, type, id, args);
        } else {
            let msg;
            try {
                msg = JSON.stringify({
                    id,
                    type,
                    arg: args[0]
                });
            } catch(err) {
                runInProcess(e.sender, type, id, args);
                return;
            }
            queue[id] = {
                sender: e.sender,
                wid: worker.id,
                time: Date.now()
            };
            worker.send(msg, err => {
                if (err && queue[id]) {
                    let entry = queue[id];
                    delete queue[id];
                    reply(entry.sender, id, null, err);
                }
            });
        }
    });

    cluster.on("message", (w, msg) => {
        try {
            msg = JSON.parse(msg);
        } catch(e) {
            return;
        }
        let entry = queue[msg.id];
        if (!entry) return;
        delete queue[msg.id];

        if (typeof msg.error !== "undefined") {
            reply(entry.sender, msg.id, null, msg.error);
        } else {
            reply(entry.sender, msg.id, msg.res);
        }
    });
} else if (cluster.isWorker) {
    const signale = require("signale");
    const si = require("systeminformation");

    signale.info("Multithread worker started at "+process.pid);

    function send(payload) {
        try {
            process.send(JSON.stringify(payload));
        } catch(e) {
            // IPC channel closed (main process exiting), nothing to do
        }
    }

    process.on("message", msg => {
        try {
            msg = JSON.parse(msg);
        } catch(e) {
            return;
        }

        new Promise((resolve, reject) => {
            if (typeof si[msg.type] !== "function") {
                reject(new Error(`Unknown systeminformation function ${msg.type}`));
                return;
            }
            resolve(si[msg.type](msg.arg));
        }).then(res => {
            send({
                id: msg.id,
                res
            });
        }, e => {
            send({
                id: msg.id,
                error: String(e)
            });
        });
    });

    process.on("disconnect", () => {
        process.exit(0);
    });
}
