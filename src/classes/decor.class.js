// Escape-game "decor" (scenery) mode.
// In-process simulator answering systeminformation-compatible calls with plausible, slowly-varying,
// themed data. It makes NO system call, NO network request and starts NO timer: the simulation is
// advanced lazily, from the elapsed wall-clock time, each time one of its functions is called.
// Loaded through a <script> tag in ui.html, and require()-able from plain Node (no DOM, no Electron).
class Decor {
    constructor(overrides) {
        const defaults = {
            seed: 777,
            osName: "ksp-os",
            hostname: "blackice-777",
            cores: 8,
            cpuManufacturer: "JADE-TEK ",
            cpuBrand: "NEURAL CORE X7",
            cpuSpeed: 3.77,             // GHz, idle clock
            cpuSpeedMax: 5.2,           // GHz, boost clock
            idleLoad: 14,               // average CPU load (%) when nothing happens in the terminal
            memTotalGiB: 64,
            swapTotalGiB: 16,
            iface: "ksp0",
            ifaceName: "BLACKICE Neural Link",
            lanIp: "10.77.7.7",
            mac: "07:77:4b:53:50:07",
            externalIp: "203.0.113.77",
            geo: null,                  // { latitude, longitude } of the "external IP", overrides the two keys below
            latitude: 22.3193,
            longitude: 114.1694,
            systemManufacturer: "KASPER CUSTOM",
            systemModel: "BLACKICE 777",
            chassisType: "Rack Mount",
            diskUse: 77.7,              // %
            diskLabel: "BLACKICE",
            pulseHalfLife: 2000,        // ms, how fast the terminal activity boost fades
            pulseScale: 600,            // chars of "energy" needed to reach ~63% of the max boost
            fakeClock: true,            // show a fictional date/time so players cannot read the real time
            year: 2077,                 // year shown by the fake clock
            clockOffsetMinutes: null,   // fixed shift of the fake time of day; null = random at each launch
            clockSpeed: 1,              // how fast the fake clock runs (1 = real time)
            uptimeDays: 77              // fake machine uptime, in days, at launch
        };
        let o = Object.assign({}, defaults, (overrides && typeof overrides === "object") ? overrides : {});

        let num = (v, d, min, max) => {
            v = Number(v);
            if (!isFinite(v)) v = d;
            return Math.min(max, Math.max(min, v));
        };
        o.cores = Math.round(num(o.cores, defaults.cores, 1, 64));
        o.cpuSpeed = num(o.cpuSpeed, defaults.cpuSpeed, 0.1, 20);
        o.cpuSpeedMax = num(o.cpuSpeedMax, defaults.cpuSpeedMax, o.cpuSpeed, 20);
        o.idleLoad = num(o.idleLoad, defaults.idleLoad, 1, 90);
        o.memTotalGiB = num(o.memTotalGiB, defaults.memTotalGiB, 1, 4096);
        o.swapTotalGiB = num(o.swapTotalGiB, defaults.swapTotalGiB, 0, 4096);
        o.diskUse = num(o.diskUse, defaults.diskUse, 0, 100);
        o.pulseHalfLife = num(o.pulseHalfLife, defaults.pulseHalfLife, 100, 600000);
        o.pulseScale = num(o.pulseScale, defaults.pulseScale, 1, 1e9);
        o.seed = Math.floor(num(o.seed, defaults.seed, -2147483648, 2147483647));
        o.fakeClock = (o.fakeClock !== false);
        o.year = Math.round(num(o.year, defaults.year, 1970, 9999));
        o.clockSpeed = num(o.clockSpeed, defaults.clockSpeed, 0.01, 100);
        o.uptimeDays = num(o.uptimeDays, defaults.uptimeDays, 0, 99999);
        if (o.clockOffsetMinutes === null || o.clockOffsetMinutes === undefined || o.clockOffsetMinutes === "random" || !isFinite(Number(o.clockOffsetMinutes))) {
            // Random but clearly wrong: between 2h and 22h away from the real time of day, odd minutes.
            // Math.random (not the seeded PRNG) so the hour changes at every launch.
            o.clockOffsetMinutes = 120 + Math.floor(Math.random() * 1200) + 7;
        } else {
            o.clockOffsetMinutes = Number(o.clockOffsetMinutes);
        }
        if (o.geo && typeof o.geo === "object") {
            o.latitude = o.geo.latitude;
            o.longitude = o.geo.longitude;
        }
        o.latitude = num(o.latitude, defaults.latitude, -90, 90);
        o.longitude = num(o.longitude, defaults.longitude, -180, 180);
        ["osName", "hostname", "cpuManufacturer", "cpuBrand", "iface", "ifaceName", "lanIp", "mac", "externalIp",
            "systemManufacturer", "systemModel", "chassisType", "diskLabel"].forEach(key => {
            if (typeof o[key] !== "string" || o[key] === "") o[key] = defaults[key];
        });
        this.opts = o;

        this._STEP = 250;       // ms per simulation step
        this._MAXSTEPS = 40;    // steps simulated at most per call (after a long pause, we just jump ahead)
        this._GIB = 1073741824;
        this._prng = o.seed >>> 0;

        // Public, contract-defined properties
        this.osName = o.osName;
        this.ipinfo = {
            ip: o.externalIp,
            geo: {
                latitude: o.latitude,
                longitude: o.longitude
            }
        };
        this.geoLookup = {
            get: ip => this._geoLookup(ip)
        };

        let now = Date.now();
        this._born = now;

        // Fake clock: the fictional time starts at (real time + offset) moved to the configured year,
        // then advances clockSpeed times faster than the real time
        this._realBase = now;
        let fake = new Date(now + o.clockOffsetMinutes * 60000);
        fake.setFullYear(o.year);
        this._fakeBase = fake.getTime();
        this._lastTick = now;
        this._lastCounter = now;
        this._lastStats = 0;

        // Terminal activity "energy", fed by pulse() and decaying exponentially
        this._energy = 0;
        this._energyT = now;

        // CPU: one mean-reverting random walk per core
        this._cores = [];
        for (let i = 0; i < o.cores; i++) {
            let base = o.idleLoad * (0.55 + this._rand() * 0.9);
            this._cores.push({
                base,
                x: base,
                w: 0.6 + this._rand() * 0.55
            });
        }

        // Memory
        this._memTotal = Math.round(o.memTotalGiB * this._GIB);
        this._swapTotal = Math.round(o.swapTotalGiB * this._GIB);
        this._memFrac = 0.46;
        this._swapFrac = 0.07;

        // Network
        this._rxBase = 140000;
        this._txBase = 38000;
        this._rxBytes = 7.7e9 + Math.floor(this._rand() * 1e9);
        this._txBytes = 1.3e9 + Math.floor(this._rand() * 3e8);
        this._ping = 22;
        this._peers = [];
        this._usedPeerIPs = {};
        let peerCount = 3 + Math.floor(this._rand() * 4);
        for (let i = 0; i < peerCount; i++) this._peers.push(this._newPeer());
        this._nextPeerChange = now + 30000 + this._rand() * 30000;

        // Processes
        this._initProcesses(now);

        // systeminformation-compatible API
        const impl = {
            cpu: () => this._cpu(),
            cpuCurrentSpeed: () => this._cpuCurrentSpeed(),
            cpuCurrentspeed: () => this._cpuCurrentSpeed(),
            currentLoad: () => this._currentLoad(),
            cpuTemperature: () => this._cpuTemperature(),
            mem: () => this._mem(),
            processes: () => this._processes(),
            networkInterfaces: () => this._networkInterfaces(),
            networkInterfaceDefault: () => o.iface,
            networkStats: iface => this._networkStats(iface),
            networkConnections: () => this._networkConnections(),
            battery: () => ({ hasBattery: false, cycleCount: 0, isCharging: false, maxCapacity: 0, currentCapacity: 0, percent: 100, timeRemaining: null, acConnected: true, type: "", model: "", manufacturer: "", serial: "" }),
            system: () => ({ manufacturer: o.systemManufacturer, model: o.systemModel, version: "7.7.7", serial: "KSP-0777-DRGN", uuid: "77777777-0777-4777-8777-777777777777", sku: "777", virtual: false }),
            chassis: () => ({ manufacturer: o.systemManufacturer, model: o.systemModel, type: o.chassisType, version: "7.7.7", serial: "KSP-0777-DRGN", assetTag: "777", sku: "777" }),
            fsSize: () => this._fsSize(),
            blockDevices: () => this._blockDevices(),
            osInfo: () => ({ platform: (typeof process !== "undefined") ? process.platform : "linux", distro: o.osName, release: "7.7.7", codename: "BLACKICE", kernel: "7.7.7-ksp", arch: "x64", hostname: o.hostname, fqdn: o.hostname, logofile: "" }),
            time: () => ({ current: this.now().getTime(), uptime: this.uptime(), timezone: "", timezoneName: "" })
        };
        const warned = {};
        const wrappers = {};
        this.si = new Proxy({}, {
            get: (target, prop) => {
                // Never look like a thenable / iterable / primitive
                if (typeof prop !== "string" || prop === "then" || prop === "toJSON" || prop === "constructor") return undefined;
                if (wrappers[prop]) return wrappers[prop];

                wrappers[prop] = (...args) => {
                    let callback = (args.length > 0 && typeof args[args.length - 1] === "function") ? args.pop() : null;
                    let res;
                    if (Object.prototype.hasOwnProperty.call(impl, prop)) {
                        res = impl[prop](...args);
                    } else {
                        if (!warned[prop]) {
                            warned[prop] = true;
                            console.warn(`Decor: systeminformation.${prop}() is not simulated, answering {}`);
                        }
                        res = {};
                    }
                    if (callback) {
                        try {
                            callback(res);
                        } catch(e) {
                            // Report the error without breaking the promise chain (same visibility as an IPC listener error)
                            setTimeout(() => { throw e; }, 0);
                        }
                    }
                    return Promise.resolve(res);
                };
                return wrappers[prop];
            },
            set: () => {
                throw new Error("Cannot set a property on the decor sysinfo proxy");
            }
        });
    }

    // ---------- public helpers ----------

    // n: number of chars just written to the terminal. Must stay cheap: called on every websocket message.
    pulse(n) {
        n = Number(n);
        if (!(n > 0)) return;
        let e = this._energyAt(Date.now()) + n;
        this._energy = (e > 1e6) ? 1e6 : e;
    }
    ping() {
        this._tick();
        let p = this._ping + (this._rand() - 0.5) * 6 + this._boost() * 6;
        p = Math.min(40, Math.max(12, p));
        return Promise.resolve(Math.round(p * 100) / 100);
    }

    // ---------- simulation core ----------

    _rand() {
        // mulberry32
        let t = this._prng = (this._prng + 0x6D2B79F5) | 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    _gauss() {
        // Cheap ~N(0, 1)
        return (this._rand() + this._rand() + this._rand() + this._rand() - 2) * 1.732;
    }
    // Mean-reverting random walk step (Ornstein-Uhlenbeck-like), clamped
    _ou(x, mu, theta, sigma, min, max) {
        x = x + theta * (mu - x) + sigma * this._gauss();
        return (x < min) ? min : ((x > max) ? max : x);
    }
    _energyAt(now) {
        let dt = now - this._energyT;
        if (dt > 0) {
            if (this._energy > 0.01) {
                this._energy *= Math.pow(0.5, dt / this.opts.pulseHalfLife);
            } else {
                this._energy = 0;
            }
            this._energyT = now;
        } else if (dt < 0) {
            // Clock went backwards: resync, otherwise energy would pile up without decaying
            this._energyT = now;
        }
        return this._energy;
    }
    // Terminal activity boost factor, 0..1
    _boost() {
        return 1 - Math.exp(-this._energyAt(Date.now()) / this.opts.pulseScale);
    }
    _rxRate(b) {
        return this._rxBase + b * 1250000;
    }
    _txRate(b) {
        return this._txBase + b * 3600000;
    }
    _tick() {
        let now = Date.now();
        let b = this._boost();

        // Integrate network counters over the real elapsed time: monotonic and consistent with the rates
        let dtc = (now - this._lastCounter) / 1000;
        if (dtc > 0) {
            this._rxBytes += Math.round(this._rxRate(b) * dtc);
            this._txBytes += Math.round(this._txRate(b) * dtc);
            this._lastCounter = now;
        } else if (dtc < 0) {
            // Clock went backwards: resync, otherwise byte counters would freeze
            this._lastCounter = now;
        }

        let elapsed = now - this._lastTick;
        if (elapsed < 0) {
            // Clock went backwards, resync (scheduled events too, so they do not stall for the size of the jump)
            this._lastTick = now;
            this._nextPeerChange = Math.min(this._nextPeerChange, now + 60000);
            this._nextTransient = Math.min(this._nextTransient, now + 22000);
            this._procs.forEach(p => {
                if (p.transient && p.until > now + 15000) p.until = now + 15000;
            });
            return now;
        }
        if (elapsed < this._STEP) return now;

        let steps = Math.floor(elapsed / this._STEP);
        if (steps > this._MAXSTEPS) {
            steps = this._MAXSTEPS;
            this._lastTick = now;
        } else {
            this._lastTick += steps * this._STEP;
        }
        for (let i = 0; i < steps; i++) this._step();

        this._updateProcessPopulation(now);
        this._updatePeers(now);
        return now;
    }
    _step() {
        this._cores.forEach(c => {
            // Rare short spikes make the graphs look alive
            if (this._rand() < 0.004) c.x = Math.min(100, c.x + 20 + this._rand() * 30);
            c.x = this._ou(c.x, c.base, 0.08, 2.2, 0.5, 100);
        });
        this._memFrac = this._ou(this._memFrac, 0.46, 0.02, 0.0025, 0.3, 0.7);
        this._swapFrac = this._ou(this._swapFrac, 0.07, 0.01, 0.0015, 0.01, 0.25);
        this._rxBase = this._ou(this._rxBase, 140000, 0.05, 9000, 4000, 900000);
        this._txBase = this._ou(this._txBase, 38000, 0.05, 3000, 1500, 400000);
        if (this._rand() < 0.003) this._rxBase += 150000 + this._rand() * 300000;
        this._ping = this._ou(this._ping, 22, 0.05, 1.2, 12, 40);
        this._procAll = this._ou(this._procAll, 231, 0.01, 0.6, 200, 260);
        this._procs.forEach(p => {
            p.x = this._ou(p.x, p.base, 0.1, p.base * 0.12 + 0.02, 0, 100);
            p.m = this._ou(p.m, p.mbase, 0.03, p.mbase * 0.01 + 0.001, 0.01, 50);
        });
    }

    // ---------- CPU ----------

    _coreLoads() {
        let b = this._boost();
        return this._cores.map(c => {
            let l = c.x + b * 68 * c.w;
            return (l > 100) ? 100 : ((l < 0) ? 0 : l);
        });
    }
    _avgLoad() {
        let loads = this._coreLoads();
        return loads.reduce((a, v) => a + v, 0) / loads.length;
    }
    _speedNow() {
        let o = this.opts;
        let f = Math.min(1, this._avgLoad() / 75);
        return o.cpuSpeed + (o.cpuSpeedMax - o.cpuSpeed) * f * 0.85;
    }
    _cpu() {
        this._tick();
        let o = this.opts;
        return {
            manufacturer: o.cpuManufacturer,
            brand: o.cpuBrand,
            vendor: "JadeTek",
            family: "7",
            model: "77",
            stepping: "7",
            revision: "",
            voltage: "",
            speed: Math.round(this._speedNow() * 100) / 100,
            speedMin: Math.round(o.cpuSpeed * 50) / 100,
            speedMax: Math.round(o.cpuSpeedMax * 100) / 100,
            governor: "overclock",
            cores: o.cores,
            physicalCores: Math.max(1, Math.ceil(o.cores / 2)),
            processors: 1,
            socket: "KSP7",
            flags: "",
            virtualization: true,
            cache: { l1d: 49152, l1i: 32768, l2: 1310720, l3: 25165824 }
        };
    }
    _cpuCurrentSpeed() {
        this._tick();
        let o = this.opts;
        let loads = this._coreLoads();
        let cores = loads.map(l => Math.round((o.cpuSpeed + (o.cpuSpeedMax - o.cpuSpeed) * Math.min(1, l / 85) * 0.9) * 100) / 100);
        let min = Math.min(...cores);
        let max = Math.max(...cores);
        let avg = Math.round(cores.reduce((a, v) => a + v, 0) / cores.length * 100) / 100;
        return { min, max, avg, cores };
    }
    _currentLoad() {
        this._tick();
        let loads = this._coreLoads();
        let cpus = loads.map(l => {
            let user = l * 0.72;
            return {
                load: l,
                loadUser: user,
                loadSystem: l - user,
                loadNice: 0,
                loadIdle: 100 - l,
                loadIrq: 0
            };
        });
        let avg = loads.reduce((a, v) => a + v, 0) / loads.length;
        return {
            avgLoad: Math.round(avg) / 100,
            currentLoad: avg,
            currentLoadUser: avg * 0.72,
            currentLoadSystem: avg * 0.28,
            currentLoadNice: 0,
            currentLoadIdle: 100 - avg,
            currentLoadIrq: 0,
            cpus
        };
    }
    _cpuTemperature() {
        this._tick();
        let loads = this._coreLoads();
        let cores = loads.map((l, i) => Math.round(38 + l * 0.42 + (i % 3)));
        let max = Math.max(...cores);
        let main = Math.round(cores.reduce((a, v) => a + v, 0) / cores.length);
        return { main, cores, max, socket: [], chipset: null };
    }

    // ---------- Memory ----------

    _mem() {
        this._tick();
        let total = this._memTotal;
        let frac = Math.min(0.92, this._memFrac + this._boost() * 0.06);
        let used = Math.round(total * frac);
        let free = total - used;
        let active = Math.round(used * 0.81);
        let buffcache = used - active;
        let available = free + Math.round(buffcache * 0.9);
        let swaptotal = this._swapTotal;
        let swapused = Math.round(swaptotal * this._swapFrac);
        return {
            total,
            free,
            used,
            active,
            available,
            buffers: Math.round(buffcache * 0.2),
            cached: buffcache - Math.round(buffcache * 0.2),
            slab: 0,
            buffcache,
            swaptotal,
            swapused,
            swapfree: swaptotal - swapused
        };
    }

    // ---------- Processes ----------

    _initProcesses(now) {
        // [name, user, base cpu %, base mem %, command, activity weight]
        const table = [
            ["init", "root", 0.0, 0.02, "/sbin/init splash", 0],
            ["kthreadd", "root", 0.0, 0.0, "[kthreadd]", 0],
            ["sshd", "root", 0.1, 0.02, "/usr/sbin/sshd -D -p 2277", 0],
            ["cryptd", "root", 0.6, 0.05, "[cryptd]", 0.1],
            ["tor", "kasper", 1.2, 0.35, "/usr/bin/tor -f /etc/tor/torrc.777", 0.4],
            ["tor", "kasper", 0.7, 0.21, "/usr/bin/tor --relay jade", 0.2],
            ["vpn777d", "root", 1.5, 0.4, "/opt/777/bin/vpn777d --hops 7 --exit lucid-blind", 0.8],
            ["proxy_chain", "kasper", 0.9, 0.12, "proxy_chain --chain 7 --rotate 30s", 0.5],
            ["proxy_chain", "kasper", 0.6, 0.12, "proxy_chain --chain 7 --rotate 30s", 0.5],
            ["proxy_chain", "kasper", 0.4, 0.11, "proxy_chain --chain 7 --rotate 30s", 0.4],
            ["kasper_shell", "kasper", 0.8, 0.31, "/home/kasper/bin/kasper_shell --tty /dev/pts/7", 1.0],
            ["node", "kasper", 1.1, 0.9, "node payload_uplink.js", 3.0],
            ["ice_breaker", "kasper", 9.5, 2.7, "./ice_breaker --target lucid-industries.corp --mode silent", 0.6],
            ["jade_scrambler", "kasper", 5.2, 1.3, "jade_scrambler --key /mnt/key/dragon.pem", 0.3],
            ["osint_crawler", "kasper", 3.1, 1.9, "python3 osint_crawler.py --seed lucid_staff.csv", 0],
            ["lucid_sniffer", "root", 2.4, 0.6, "lucid_sniffer -i ksp0 -w /var/cap/lucid.pcap", 0.7],
            ["netcat", "kasper", 0.2, 0.01, "nc -lvnp 7777", 0.8],
            ["hashcat", "kasper", 6.8, 3.4, "hashcat -m 1800 -a 3 lucid_shadow.txt", 0],
            ["ghostd", "root", 0.3, 0.08, "/usr/lib/ghost/ghostd --shell", 0],
            ["neural_link", "kasper", 1.9, 4.2, "/opt/neural/bin/neural_link --sync", 0.2],
            ["blackice_fw", "root", 0.5, 0.15, "/opt/blackice/blackice_fw --paranoid", 0.4],
            ["dns_poisoner", "kasper", 0.3, 0.05, "dns_poisoner --zone lucid.corp", 0],
            ["keylogd", "SYSTEM", 0.1, 0.03, "keylogd --stealth", 0],
            ["rootkit_watch", "SYSTEM", 0.2, 0.07, "rootkit_watch --interval 7", 0],
            ["satlink", "root", 0.4, 0.2, "/opt/777/bin/satlink --orbit leo-77", 0.3],
            ["dronectl", "kasper", 0.3, 0.6, "dronectl --swarm jade-watch", 0],
            ["mirrord", "SYSTEM", 0.2, 0.3, "mirrord --mirror 777://archive", 0],
            ["cyberdeck", "kasper", 2.0, 3.1, "cyberdeck --ui eDEX", 0.5],
            ["svchost", "SYSTEM", 0.1, 0.1, "svchost -k ksp", 0],
            ["journald", "root", 0.1, 0.09, "/lib/systemd/journald", 0.1]
        ];
        // Process "boot" time: daemons started a while ago, the payload uplink only a few minutes ago
        this._bootTime = now - (7 * 3600 + 7 * 60 + 7) * 1000;
        this._usedPids = {};
        this._procs = table.map((t, i) => {
            let pid = (i === 0) ? 1 : ((i === 1) ? 2 : this._newPid(300, 30000));
            let started;
            if (i < 4) {
                started = this._bootTime + i * 1000;
            } else if (t[0] === "node" || t[0] === "netcat" || t[0] === "kasper_shell") {
                started = now - (60 + Math.floor(this._rand() * 600)) * 1000;
            } else {
                started = this._bootTime + Math.floor(this._rand() * 6 * 3600) * 1000;
            }
            return {
                pid,
                parentPid: (i === 0) ? 0 : ((i === 1) ? 0 : 1),
                name: t[0],
                user: t[1],
                base: t[2],
                x: t[2],
                mbase: t[3],
                m: t[3],
                command: t[4],
                w: t[5],
                started: this._fmtDate(started),
                priority: (t[1] === "root" || t[1] === "SYSTEM") ? 20 : 19,
                transient: false
            };
        });
        // kasper_shell is the parent of node and netcat
        let shell = this._procs.find(p => p.name === "kasper_shell");
        this._procs.forEach(p => {
            if (p.name === "node" || p.name === "netcat") p.parentPid = shell.pid;
        });
        this._transientPool = [
            ["nmap", "nmap -sS -T4 198.51.100.0/24"],
            ["curl", "curl -s https://lucid-industries.corp/api/v7/staff"],
            ["dig", "dig axfr lucid.corp"],
            ["whois", "whois lucid-industries.corp"],
            ["sha256sum", "sha256sum /mnt/key/virus.bin"],
            ["ssh-keygen", "ssh-keygen -t ed25519 -f ./lucid_ssh"],
            ["base64", "base64 -d payload.b64"],
            ["traceroute", "traceroute 203.0.113.7"]
        ];
        this._nextPid = 31000 + Math.floor(this._rand() * 2000);
        this._nextTransient = now + 8000 + this._rand() * 10000;
        this._procAll = 231;
    }
    _newPid(min, max) {
        let pid;
        do {
            pid = min + Math.floor(this._rand() * (max - min));
        } while (this._usedPids[pid]);
        this._usedPids[pid] = true;
        return pid;
    }
    _updateProcessPopulation(now) {
        // Remove expired short-lived processes
        if (this._procs.some(p => p.transient && p.until <= now)) {
            this._procs = this._procs.filter(p => !p.transient || p.until > now);
        }
        if (now >= this._nextTransient) {
            let t = this._transientPool[Math.floor(this._rand() * this._transientPool.length)];
            let shell = this._procs.find(p => p.name === "kasper_shell");
            let cpu = 0.5 + this._rand() * 4;
            this._nextPid += 1 + Math.floor(this._rand() * 40);
            if (this._nextPid > 99000) this._nextPid = 31000;
            this._procs.push({
                pid: this._nextPid,
                parentPid: shell ? shell.pid : 1,
                name: t[0],
                user: "kasper",
                base: cpu,
                x: cpu,
                mbase: 0.05 + this._rand() * 0.3,
                m: 0.1,
                command: t[1],
                w: 0,
                started: this._fmtDate(now),
                priority: 19,
                transient: true,
                until: now + 5000 + this._rand() * 10000
            });
            this._nextTransient = now + 10000 + this._rand() * 12000;
        }
    }
    // Real epoch ms -> displayed epoch ms (fictional when fakeClock is on)
    toDisplayTime(ms) {
        if (!this.opts.fakeClock) return ms;
        return Math.round(this._fakeBase + (ms - this._realBase) * this.opts.clockSpeed);
    }
    // Current displayed date (fictional when fakeClock is on): use it instead of new Date() in the UI
    now() {
        return new Date(this.toDisplayTime(Date.now()));
    }
    // Fake machine uptime in seconds (never the real one, which would tell how long the PC has been on)
    uptime() {
        let elapsed = Math.max(0, Date.now() - this._realBase) / 1000;
        return Math.floor(this.opts.uptimeDays * 86400 + (7 * 3600 + 7 * 60) + elapsed * this.opts.clockSpeed);
    }
    _fmtDate(ms) {
        let d = new Date(this.toDisplayTime(ms));
        let p = n => (n < 10 ? "0" : "") + n;
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    _processes() {
        this._tick();
        let b = this._boost();
        let running = 0;
        let list = this._procs.map(p => {
            let cpu = p.x + b * 12 * p.w;
            cpu = Math.round(Math.min(100, Math.max(0, cpu)) * 100) / 100;
            let mem = Math.round((p.m + b * 0.2 * p.w) * 100) / 100;
            let state = (cpu > 2) ? "running" : "sleeping";
            if (state === "running") running++;
            return {
                pid: p.pid,
                parentPid: p.parentPid,
                name: p.name,
                cpu,
                cpuu: Math.round(cpu * 72) / 100,
                cpus: Math.round(cpu * 28) / 100,
                mem,
                priority: p.priority,
                memVsz: Math.round(mem * this._memTotal / 102400 * 1.6),
                memRss: Math.round(mem * this._memTotal / 102400),
                nice: 0,
                started: p.started,
                state,
                tty: (p.user === "kasper") ? "pts/7" : "",
                user: p.user,
                command: p.command,
                params: "",
                path: ""
            };
        });
        let all = Math.round(this._procAll);
        let blocked = (b > 0.5) ? 1 : 0;
        running = running + 1; // the process answering this call
        return {
            all,
            running,
            blocked,
            sleeping: all - running - blocked,
            unknown: 0,
            list
        };
    }

    // ---------- Network ----------

    _networkInterfaces() {
        this._tick();
        let o = this.opts;
        return [
            {
                iface: o.iface,
                ifaceName: o.ifaceName,
                default: true,
                ip4: o.lanIp,
                ip4subnet: "255.255.0.0",
                ip6: "",
                ip6subnet: "",
                mac: o.mac,
                internal: false,
                virtual: false,
                operstate: "up",
                type: "wired",
                duplex: "full",
                mtu: 1500,
                speed: 10000,
                dhcp: false,
                dnsSuffix: "",
                ieee8021xAuth: "",
                ieee8021xState: "",
                carrierChanges: 0
            },
            {
                iface: "lo",
                ifaceName: "lo",
                default: false,
                ip4: "127.0.0.1",
                ip4subnet: "255.0.0.0",
                ip6: "::1",
                ip6subnet: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
                mac: "00:00:00:00:00:00",
                internal: true,
                virtual: false,
                operstate: "up",
                type: "virtual",
                duplex: "",
                mtu: 65536,
                speed: null,
                dhcp: false,
                dnsSuffix: "",
                ieee8021xAuth: "",
                ieee8021xState: "",
                carrierChanges: 0
            }
        ];
    }
    _networkStats(iface) {
        let now = this._tick();
        let b = this._boost();
        let ms = (this._lastStats > 0) ? Math.max(1, now - this._lastStats) : 1000;
        this._lastStats = now;
        let jitter = () => 0.92 + this._rand() * 0.16;
        let rx = this._rxRate(b) * jitter();
        let tx = this._txRate(b) * jitter();
        return [{
            iface: (typeof iface === "string" && iface !== "" && iface !== "*") ? iface : this.opts.iface,
            operstate: "up",
            rx_bytes: this._rxBytes,
            rx_dropped: 0,
            rx_errors: 0,
            tx_bytes: this._txBytes,
            tx_dropped: 0,
            tx_errors: 0,
            rx_sec: Math.round(rx),
            tx_sec: Math.round(tx),
            ms
        }];
    }
    _fakePublicIp() {
        const ranges = ["192.0.2.", "198.51.100.", "203.0.113."];
        let ip;
        do {
            ip = ranges[Math.floor(this._rand() * ranges.length)] + (1 + Math.floor(this._rand() * 254));
        } while (ip === this.opts.externalIp || this._usedPeerIPs[ip]);
        return ip;
    }
    _newPeer() {
        const ports = [443, 22, 9001, 6667, 8443, 1337, 31337, 8080, 2277, 7777];
        let ip = this._fakePublicIp();
        this._usedPeerIPs[ip] = true;
        return {
            peeraddress: ip,
            peerport: String(ports[Math.floor(this._rand() * ports.length)]),
            localport: String(40000 + Math.floor(this._rand() * 25000))
        };
    }
    _updatePeers(now) {
        if (now < this._nextPeerChange) return;
        this._nextPeerChange = now + 30000 + this._rand() * 30000;
        let r = this._rand();
        if (r < 0.25 && this._peers.length < 6) {
            this._peers.push(this._newPeer());
        } else if (r < 0.5 && this._peers.length > 3) {
            let gone = this._peers.splice(Math.floor(this._rand() * this._peers.length), 1)[0];
            delete this._usedPeerIPs[gone.peeraddress];
        } else {
            let idx = Math.floor(this._rand() * this._peers.length);
            delete this._usedPeerIPs[this._peers[idx].peeraddress];
            this._peers[idx] = this._newPeer();
        }
    }
    _networkConnections() {
        this._tick();
        return this._peers.map(p => ({
            protocol: "tcp",
            localaddress: this.opts.lanIp,
            localport: p.localport,
            peeraddress: p.peeraddress,
            peerport: p.peerport,
            state: "ESTABLISHED",
            pid: null,
            process: ""
        }));
    }
    _geoLookup(ip) {
        if (typeof ip !== "string") return null;
        let m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return null;
        let a = Number(m[1]), b = Number(m[2]);
        if ([1, 2, 3, 4].some(i => Number(m[i]) > 255)) return null;
        // Private, loopback, link-local, multicast...: not geolocatable
        if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;

        if (ip === this.opts.externalIp) {
            return { location: { latitude: this.opts.latitude, longitude: this.opts.longitude, accuracy_radius: 50 } };
        }

        const cities = [
            [35.6762, 139.6503],    // Tokyo
            [22.3193, 114.1694],    // Hong Kong
            [31.2304, 121.4737],    // Shanghai
            [37.5665, 126.9780],    // Seoul
            [1.3521, 103.8198],     // Singapore
            [40.7128, -74.0060],    // New York
            [34.0522, -118.2437],   // Los Angeles
            [50.1109, 8.6821],      // Frankfurt
            [52.3676, 4.9041],      // Amsterdam
            [51.5074, -0.1278],     // London
            [55.7558, 37.6173],     // Moscow
            [64.1466, -21.9426],    // Reykjavik
            [-23.5505, -46.6333],   // Sao Paulo
            [19.4326, -99.1332],    // Mexico City
            [25.2048, 55.2708],     // Dubai
            [-33.8688, 151.2093],   // Sydney
            [59.3293, 18.0686],     // Stockholm
            [47.3769, 8.5417]       // Zurich
        ];
        // FNV-1a hash of the IP string: deterministic per IP
        let h = 0x811c9dc5;
        for (let i = 0; i < ip.length; i++) {
            h ^= ip.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        h = h >>> 0;
        let city = cities[h % cities.length];
        let jlat = (((h >>> 8) & 0xff) / 255 - 0.5) * 2;
        let jlon = (((h >>> 16) & 0xff) / 255 - 0.5) * 2;
        return {
            location: {
                latitude: Math.round((city[0] + jlat) * 10000) / 10000,
                longitude: Math.round((city[1] + jlon) * 10000) / 10000,
                accuracy_radius: 100
            }
        };
    }

    // ---------- Storage ----------

    _isWin() {
        return (typeof process !== "undefined" && process.platform === "win32");
    }
    // Existing Windows drive letters (C: .. Z:), so that every folder the players can browse to
    // (e.g. a USB key on E:) matches a mount. Cached for 60 s: a few cheap stat calls, no process spawned.
    _winDrives() {
        let now = Date.now();
        if (this._drives && now - this._drivesT >= 0 && now - this._drivesT < 60000) return this._drives;
        let drives = [];
        try {
            let fs = require("fs");
            for (let c = 67; c <= 90; c++) {
                let l = String.fromCharCode(c);
                try {
                    if (fs.existsSync(l + ":\\")) drives.push(l);
                } catch(e) {
                    // ignore this letter
                }
            }
        } catch(e) {
            drives = [];
        }
        if (drives.length === 0) drives = ["C", "D"];
        this._drives = drives;
        this._drivesT = now;
        return drives;
    }
    _winDriveSize(l) {
        if (l === "C") return 2000398934016;
        if (l === "D") return 4000787030016;
        return 256060514304;
    }
    _winDriveUse(l) {
        let use = this.opts.diskUse;
        if (l === "C") return use;
        if (l === "D") return Math.round(use * 0.857 * 10) / 10;
        return Math.round(use * (0.3 + ((l.charCodeAt(0) * 37) % 50) / 100) * 10) / 10;
    }
    _fsSize() {
        let use = this.opts.diskUse;
        let mk = (fs, type, size, mount, u) => {
            let used = Math.round(size * u / 100);
            return { fs, type, size, used, available: size - used, use: u, mount, rw: true };
        };
        if (this._isWin()) {
            return this._winDrives().map(l => mk(l + ":", "NTFS", this._winDriveSize(l), l + ":", this._winDriveUse(l)));
        }
        return [
            mk("/dev/ksp0p2", "ext4", 2000398934016, "/", use),
            mk("/dev/ksp1p1", "ext4", 4000787030016, "/mnt/vault777", Math.round(use * 0.857 * 10) / 10)
        ];
    }
    _blockDevices() {
        let o = this.opts;
        if (this._isWin()) {
            return this._winDrives().map(l => {
                let label = (l === "C") ? o.diskLabel : ((l === "D") ? "VAULT_777" : "EXT_" + l);
                return { name: l + ":", identifier: l + ":", type: "disk", fsType: "ntfs", mount: l + ":\\", size: this._winDriveSize(l), physical: "SSD", uuid: "", label, model: o.systemModel, serial: "", removable: false, protocol: "NVMe" };
            });
        }
        return [
            { name: "ksp0p2", identifier: "ksp0p2", type: "disk", fsType: "ext4", mount: "/", size: 2000398934016, physical: "SSD", uuid: "", label: o.diskLabel, model: o.systemModel, serial: "", removable: false, protocol: "nvme" }
        ];
    }
}

module.exports = {
    Decor
};
