class Cpuinfo {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create initial DOM
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_cpuinfo">
        </div>`;
        this.container = document.getElementById("mod_cpuinfo");

        // Init Smoothie
        let TimeSeries = require("smoothie").TimeSeries;
        let SmoothieChart = require("smoothie").SmoothieChart;

        this.series = [];
        this.charts = [];
        // The first si.cpu() call can fail (proxy timeout, worker restart): retry it, otherwise the panel would stay empty
        const init = attempt => window.si.cpu().then(data => {
            let divide = Math.floor(data.cores/2);
            this.divide = divide;

            let cpuName = data.manufacturer+data.brand;
            cpuName = cpuName.substr(0, 30);
            cpuName.substr(0, Math.min(cpuName.length, cpuName.lastIndexOf(" ")));

            let innercontainer = document.createElement("div");
            innercontainer.setAttribute("id", "mod_cpuinfo_innercontainer");
            innercontainer.innerHTML = `<h1>CPU USAGE<i>${cpuName}</i></h1>
                <div>
                    <h1># <em>1</em> - <em>${divide}</em><br>
                    <i id="mod_cpuinfo_usagecounter0">Avg. --%</i></h1>
                    <canvas id="mod_cpuinfo_canvas_0" height="60"></canvas>
                </div>
                <div>
                    <h1># <em>${divide+1}</em> - <em>${data.cores}</em><br>
                    <i id="mod_cpuinfo_usagecounter1">Avg. --%</i></h1>
                    <canvas id="mod_cpuinfo_canvas_1" height="60"></canvas>
                </div>
                <div>
                    <div>
                        <h1>${(process.platform === "win32") ? "CORES" : "TEMP"}<br>
                        <i id="mod_cpuinfo_temp">${(process.platform === "win32") ? data.cores : "--°C"}</i></h1>
                    </div>
                    <div>
                        <h1>SPD<br>
                        <i id="mod_cpuinfo_speed_min">--GHz</i></h1>
                    </div>
                    <div>
                        <h1>MAX<br>
                        <i id="mod_cpuinfo_speed_max">--GHz</i></h1>
                    </div>
                    <div>
                        <h1>TASKS<br>
                        <i id="mod_cpuinfo_tasks">---</i></h1>
                    </div>
                </div>`;
            this.container.append(innercontainer);

            for (var i = 0; i < 2; i++) {
                this.charts.push(new SmoothieChart({
                    limitFPS: 15,
                    responsive: true,
                    millisPerPixel: 50,
                    grid:{
                        fillStyle:'transparent',
                        strokeStyle:'transparent',
                        verticalSections:0,
                        borderVisible:false
                    },
                    labels:{
                        disabled: true
                    },
                    yRangeFunction: () => {
                        return {min:0,max:100};
                    }
                }));
            }

            for (var i = 0; i < data.cores; i++) {
                // Create TimeSeries
                this.series.push(new TimeSeries());

                let serie = this.series[i];
                let options = {
                    lineWidth: 1.7,
                    strokeStyle: `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`
                };

                if (i < divide) {
                    this.charts[0].addTimeSeries(serie, options);
                } else {
                    this.charts[1].addTimeSeries(serie, options);
                }
            }

            for (var i = 0; i < 2; i++) {
                // Delay matches the 1 s load polling so the line never shows a gap at the leading edge
                this.charts[i].streamTo(document.getElementById(`mod_cpuinfo_canvas_${i}`), 1000);
            }

            // Init updater
            // MAX box is static: set it once from the initial si.cpu() call
            try {
                document.getElementById("mod_cpuinfo_speed_max").innerText = `${data.speedMax}GHz`;
            } catch(e) {
                // Fail silently, DOM element is probably getting refreshed (new theme, etc)
            }

            this.updatingCPUload = false;
            this.updatingCPUtemp = false;
            this.updatingCPUspeed = false;
            this.updatingCPUtasks = false;
            this.updateCPUload();
            if (process.platform !== "win32") {this.updateCPUtemp();}
            this.updateCPUspeed();
            this.updateCPUtasks();
            this.loadUpdater = setInterval(() => {
                this.updateCPUload();
            }, 1000);
            if (process.platform !== "win32") {
                this.tempUpdater = setInterval(() => {
                    this.updateCPUtemp();
                }, 5000);
            }
            this.speedUpdater = setInterval(() => {
                this.updateCPUspeed();
            }, 2000);
            this.tasksUpdater = setInterval(() => {
                this.updateCPUtasks();
            }, 5000);
        }, e => {
            console.warn("Cpuinfo: could not retrieve CPU info", e);
            if (attempt < 20) setTimeout(() => init(attempt + 1), 5000);
        }).catch(e => {
            console.warn("Cpuinfo: init failed", e);
        });
        init(0);
    }
    updateCPUload() {
        if (this.updatingCPUload) return;
        this.updatingCPUload = true;
        window.si.currentLoad().then(data => {
            if (!data || !data.cpus) return; // Prevent memleak in rare case where systeminformation takes extra time to retrieve CPU info (see github issue #216)

            let average = [[], []];
            let time = new Date().getTime();

            data.cpus.forEach((e, i) => {
                if (!this.series[i]) return;
                this.series[i].append(time, e.load);

                if (i < this.divide) {
                    average[0].push(e.load);
                } else {
                    average[1].push(e.load);
                }
            });
            average.forEach((stats, i) => {
                if (stats.length === 0) return;
                average[i] = Math.round(stats.reduce((a, b) => a + b, 0)/stats.length);

                try {
                    document.getElementById(`mod_cpuinfo_usagecounter${i}`).innerText = `Avg. ${average[i]}%`;
                } catch(e) {
                    // Fail silently, DOM element is probably getting refreshed (new theme, etc)
                }
            });
        }).catch(e => {
            console.warn(e);
        }).finally(() => {
            this.updatingCPUload = false;
        });
    }
    updateCPUtemp() {
        if (this.updatingCPUtemp) return;
        this.updatingCPUtemp = true;
        window.si.cpuTemperature().then(data => {
            try {
                document.getElementById("mod_cpuinfo_temp").innerText = `${data.max}°C`;
            } catch(e) {
                // See above notice
            }
        }).catch(e => {
            console.warn(e);
        }).finally(() => {
            this.updatingCPUtemp = false;
        });
    }
    updateCPUspeed() {
        if (this.updatingCPUspeed) return;
        this.updatingCPUspeed = true;
        window.si.cpuCurrentSpeed().then(data => {
            try {
                document.getElementById("mod_cpuinfo_speed_min").innerText = `${data.avg}GHz`;
            } catch(e) {
                // See above notice
            }
        }).catch(e => {
            console.warn(e);
        }).finally(() => {
            this.updatingCPUspeed = false;
        });
    }
    updateCPUtasks() {
        if (this.updatingCPUtasks) return;
        this.updatingCPUtasks = true;
        window.si.processes().then(data => {
            try {
                document.getElementById("mod_cpuinfo_tasks").innerText = `${data.all}`;
            } catch(e) {
                // See above notice
            }
        }).catch(e => {
            console.warn(e);
        }).finally(() => {
            this.updatingCPUtasks = false;
        });
    }
}

module.exports = {
    Cpuinfo
};
