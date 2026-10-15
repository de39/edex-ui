class HardwareInspector {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create DOM
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_hardwareInspector");
        this._element.innerHTML = `<div id="mod_hardwareInspector_inner">
            <div>
                <h1>MANUFACTURER</h1>
                <h2 id="mod_hardwareInspector_manufacturer" >NONE</h2>
            </div>
            <div>
                <h1>MODEL</h1>
                <h2 id="mod_hardwareInspector_model" >NONE</h2>
            </div>
            <div>
                <h1>CHASSIS</h1>
                <h2 id="mod_hardwareInspector_chassis" >NONE</h2>
            </div>
        </div>`;

        this.parent.append(this._element);

        // Static data: fetch once (call updateInfo() manually to refresh)
        this.updatingInfo = false;
        this.updateInfo();
    }
    updateInfo() {
        if (this.updatingInfo) return;
        this.updatingInfo = true;
        Promise.all([window.si.system(), window.si.chassis()]).then(([d, e]) => {
            d = d || {};
            e = e || {};
            let manufacturer = String(d.manufacturer || "");
            let model = String(d.model || "");
            let chassis = String(e.type || "");
            document.getElementById("mod_hardwareInspector_manufacturer").innerText = this._trimDataString(manufacturer) || "NONE";
            document.getElementById("mod_hardwareInspector_model").innerText = this._trimDataString(model, manufacturer, chassis) || "NONE";
            document.getElementById("mod_hardwareInspector_chassis").innerText = chassis || "NONE";
        }).catch(err => {
            console.warn(err);
            // The first fetch can fail (slow wmic at boot, worker restart...): retry later instead of showing NONE forever
            clearTimeout(this._retryTimer);
            this._retryTimer = setTimeout(() => this.updateInfo(), 20000);
        }).finally(() => {
            this.updatingInfo = false;
        });
    }
    _trimDataString(str, ...filters) {
        return str.trim().split(" ").filter(word => {
            if (typeof filters !== "object") return true;

            return !filters.includes(word);
        }).slice(0, 2).join(" ");
    }
}

module.exports = {
    HardwareInspector
};
