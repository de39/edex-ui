class Toplist {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create DOM
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_toplist");
        this._element.innerHTML = `<h1>TOP PROCESSES<i>PID | NAME | CPU | MEM</i></h1><br>
        <table id="mod_toplist_table"></table>`;
        this._element.onclick = this.processList;

        this.parent.append(this._element);

        this.currentlyUpdating = false;

        this.updateList();
        this.listUpdater = setInterval(() => {
            this.updateList();
        }, 5000);
    }
    // Returns a NEW list (the processes() result may be cached and shared with other modules, so never mutate it).
    // When excludeThreadsFromToplist is on, entries sharing the same name are merged into the one with the lowest PID
    // (same result as the former O(n^2) findIndex filter, in O(n) with a Map).
    static _prepareList(list) {
        if (!Array.isArray(list)) return [];
        if (window.settings.excludeThreadsFromToplist !== true) return list.slice();

        let byName = new Map();
        let out = [];
        list.slice().sort((a, b) => {
            return (a.pid-b.pid);
        }).forEach(e => {
            let first = byName.get(e.name);
            if (first) {
                first.cpu = first.cpu+e.cpu;
                first.mem = first.mem+e.mem;
            } else {
                let copy = Object.assign({}, e);
                byName.set(e.name, copy);
                out.push(copy);
            }
        });
        return out;
    }
    updateList() {
        if (this.currentlyUpdating) return;

        this.currentlyUpdating = true;
        window.si.processes().then(data => {
            if (!data || !Array.isArray(data.list)) return;

            let list = Toplist._prepareList(data.list).sort((a, b) => {
                return ((b.cpu-a.cpu)*100 + b.mem-a.mem);
            }).splice(0, 5);

            let table = document.getElementById("mod_toplist_table");
            if (!table) return;
            document.querySelectorAll("#mod_toplist_table > tr").forEach(el => {
                el.remove();
            });
            list.forEach(proc => {
                let el = document.createElement("tr");
                el.innerHTML = `<td>${proc.pid}</td>
                                <td><strong>${window._escapeHtml(String(proc.name))}</strong></td>
                                <td>${Math.round(proc.cpu*10)/10}%</td>
                                <td>${Math.round(proc.mem*10)/10}%</td>`;
                table.append(el);
            });
        }).catch(e => {
            console.warn(e);
        }).finally(() => {
            this.currentlyUpdating = false;
        });
    }

    processList(){
        let sortKey;
        let ascending = false;
        let removed = false;
        let currentlyUpdating = false;

        function setSortKey(fieldName){
            if (sortKey === fieldName){
                if (ascending){
                    sortKey = undefined;
                    ascending = false;
                }
                else{
                    ascending = true;
                }
            }
            else {
                sortKey = fieldName;
                ascending = false;
            }
        }

        function formatRuntime(ms){
            const msInDay = 24 * 60 * 60 * 1000;
            let days = Math.floor(ms / msInDay);
            let remainingMS = ms % msInDay;

            const msInHour = 60 * 60 * 1000;
            let hours = Math.floor(remainingMS / msInHour);
            remainingMS = ms % msInHour;

            let msInMin = 60 * 1000;
            let minutes = Math.floor(remainingMS / msInMin);
            remainingMS = ms % msInMin;

            let seconds = Math.floor(remainingMS / 1000);

            return `${days < 10 ? "0" : ""}${days}:${hours < 10 ? "0" : ""}${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
        }

        function updateProcessList() {
            if (currentlyUpdating) return;
            currentlyUpdating = true;
            window.si.processes().then(data => {
                if (removed) {
                    clearInterval(updateInterval);
                    return;
                }
                if (!data || !Array.isArray(data.list)) return;

                let procs = Toplist._prepareList(data.list).map(proc => {
                    // Copy before adding runtime so a cached/shared result is never mutated
                    return Object.assign({}, proc, {runtime: new Date(Date.now() - Date.parse(proc.started))});
                });

                let list = procs.sort((a, b) => {
                    switch (sortKey) {
                        case "PID":
                            if (ascending) return a.pid - b.pid;
                            else return b.pid - a.pid;
                        case "Name":
                            if (ascending) {
                                if (a.name > b.name) return -1;
                                if (a.name < b.name) return 1;
                                return 0;
                            }
                            else {
                                if (a.name < b.name) return -1;
                                if (a.name > b.name) return 1;
                                return 0;
                            }
                        case "User":
                            if (ascending) {
                                if (a.user > b.user) return -1;
                                if (a.user < b.user) return 1;
                                return 0;
                            }
                            else {
                                if (a.user < b.user) return -1;
                                if (a.user > b.user) return 1;
                                return 0;
                            }
                        case "CPU":
                            if (ascending) return a.cpu - b.cpu;
                            else return b.cpu - a.cpu;
                        case "Memory":
                            if (ascending) return a.mem - b.mem;
                            else return b.mem - a.mem;
                        case "State":
                            if (a.state < b.state) return -1;
                            if (a.state > b.state) return 1;
                            return 0;
                        case "Started":
                            if (ascending) return Date.parse(a.started) - Date.parse(b.started);
                            else return Date.parse(b.started) - Date.parse(a.started);
                        case "Runtime":
                            if (ascending) return a.runtime - b.runtime;
                            else return b.runtime - a.runtime;
                        default:
                            // default to the same sorting as the toplist
                            return ((b.cpu - a.cpu) * 100 + b.mem - a.mem);
                    }
                });

                let tbody = document.getElementById("processList");
                if (!tbody) return;
                document.querySelectorAll("#processList > tr").forEach(el => {
                    el.remove();
                });

                list.forEach(proc => {
                    let el = document.createElement("tr");
                    el.innerHTML = `<td class="pid">${proc.pid}</td>
                        <td class="name">${window._escapeHtml(String(proc.name))}</td>
                        <td class="user">${window._escapeHtml(String(proc.user))}</td>
                        <td class="cpu">${Math.round(proc.cpu * 10) / 10}%</td>
                        <td class="mem">${Math.round(proc.mem * 10) / 10}%</td>
                        <td class="state">${window._escapeHtml(String(proc.state))}</td>
                        <td class="started">${window._escapeHtml(String(proc.started))}</td>
                        <td class="runtime">${formatRuntime(proc.runtime)}</td>`;
                    tbody.append(el);
                });
            }).catch(e => {
                console.warn(e);
            }).finally(() => {
                currentlyUpdating = false;
            });
        }

        window.keyboard.detach();
        new Modal(
            {
                type: "custom",
                title: "Active Processes",
                html: `
<table id=\"processContainer\">
    <thead>
        <tr>
            <td class="pid header">PID</td>
            <td class="name header">Name</td>
            <td class="user header">User</td>
            <td class="cpu header">CPU</td>
            <td class="mem header">Memory</td>
            <td class="state header">State</td>
            <td class="started header">Started</td>
            <td class="runtime header">Runtime</td>
        </tr>
    </thead>
    <tbody id=\"processList\">
    </tbody>
  </table>`,
            },
            () => {
                removed = true;
                clearInterval(updateInterval);
            }
        );

        let headers = document.getElementsByClassName("header");
        for (let header of headers){
            let title = header.textContent;
            header.addEventListener("click", () => {
                for (let header of headers) {
                    header.textContent = header.textContent.replace('\u25B2', "").replace('\u25BC', "");
                }
                setSortKey(title);
                if (sortKey){
                    header.textContent = `${title}${ascending ? '\u25B2' : '\u25BC'}`;
                }
            });
        }

        updateProcessList();
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
        var updateInterval = setInterval(updateProcessList, 2000);
    }
}

module.exports = {
    Toplist
};
