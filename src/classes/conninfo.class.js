class Conninfo {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create DOM
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_conninfo">
            <div id="mod_conninfo_innercontainer">
                <h1>NETWORK TRAFFIC<i>UP / DOWN, MB/S</i></h1>
                <h2>TOTAL<i>0B OUT, 0B IN</i></h2>
                <canvas id="mod_conninfo_canvas_top"></canvas>
                <canvas id="mod_conninfo_canvas_bottom"></canvas>
                <h3>OFFLINE</h3>
            </div>
        </div>`;

        this.current = document.querySelector("#mod_conninfo_innercontainer > h1 > i");
        this.total = document.querySelector("#mod_conninfo_innercontainer > h2 > i");
        this._pb = require("pretty-bytes");

        // Init Smoothie
        let TimeSeries = require("smoothie").TimeSeries;
        let SmoothieChart = require("smoothie").SmoothieChart;

        // Set chart options
        let chartOptions = [{
            limitFPS: 15,
            responsive: true,
            millisPerPixel: 70,
            interpolation: 'linear',
            grid:{
                millisPerLine: 5000,
                fillStyle:'transparent',
                strokeStyle:`rgba(${window.theme.r},${window.theme.g},${window.theme.b},0.4)`,
                verticalSections:3,
                borderVisible:false
            },
            labels:{
                fontSize: 10,
                fillStyle: `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                precision: 2
            }
        }];
        chartOptions.push(Object.assign({}, chartOptions[0]));  // Deep copy object, see http://jsben.ch/bWfk9
        chartOptions[0].minValue = 0;
        chartOptions[1].maxValue = 0;

        // Create chart
        this.series = [new TimeSeries(), new TimeSeries()];
        this.charts = [new SmoothieChart(chartOptions[0]), new SmoothieChart(chartOptions[1])];

        this.charts[0].addTimeSeries(this.series[0], {lineWidth:1.7,strokeStyle:`rgb(${window.theme.r},${window.theme.g},${window.theme.b})`});
        this.charts[1].addTimeSeries(this.series[1], {lineWidth:1.7,strokeStyle:`rgb(${window.theme.r},${window.theme.g},${window.theme.b})`});

        // Delay matches the 2 s polling so the line never shows a gap at the leading edge
        this.charts[0].streamTo(document.getElementById("mod_conninfo_canvas_top"), 2000);
        this.charts[1].streamTo(document.getElementById("mod_conninfo_canvas_bottom"), 2000);

        // Init updater
        this.currentlyUpdating = false;
        this.updateInfo();
        this.infoUpdater = setInterval(() => {
            this.updateInfo();
        }, 2000);
    }
    updateInfo() {
        let time = new Date().getTime();
        let container = document.querySelector("div#mod_conninfo");

        // At startup, Netstat may not have detected the interface yet: the next poll will show the real state.
        // (Do not flash "OFFLINE" for 2 s, which is visible with fast boot.)
        if (!this._firstPollDone && window.mods.netstat && window.mods.netstat.iface === null && !window.mods.netstat.offline) {
            this._firstPollDone = true;
            setTimeout(() => this.updateInfo(), 300);
            return;
        }
        this._firstPollDone = true;

        if (!window.mods.netstat || window.mods.netstat.offline || window.mods.netstat.iface === null) {
            this.series[0].append(time, 0);
            this.series[1].append(time, 0);
            if (container) container.setAttribute("class", "offline");
            return;
        } else {
            if (container) container.setAttribute("class", "");
            if (this.currentlyUpdating) return;
            this.currentlyUpdating = true;
            window.si.networkStats(window.mods.netstat.iface).then(data => {
                if (!Array.isArray(data) || !data[0]) return;
                let stats = data[0];
                let tx = Number(stats.tx_sec) || 0;
                let rx = Number(stats.rx_sec) || 0;

                let max0 = this.series[0].maxValue;
                let max1 = -this.series[1].minValue;
                if (max0 > max1) {
                    this.series[1].minValue = -max0;
                } else if (max1 > max0) {
                    this.series[0].maxValue = max1;
                }

                this.series[0].append(time, tx/125000);
                this.series[1].append(time, -rx/125000);

                this.total.innerText = `${this._pb(Number(stats.tx_bytes) || 0)} OUT, ${this._pb(Number(stats.rx_bytes) || 0)} IN`.toUpperCase();
                this.current.innerText = "UP " + parseFloat(tx/125000).toFixed(2) + " DOWN " + parseFloat(rx/125000).toFixed(2);
            }).catch(e => {
                console.warn(e);
            }).finally(() => {
                this.currentlyUpdating = false;
            });
        }
    }
}

module.exports = {
    Conninfo
};
