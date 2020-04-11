require("@babel/polyfill");
const turbogrid = require("turbogrid");

require("./main.scss");
const template = require("./main.html");

var PF = function(v, t = 1, digits = 2, unit = "%") {
    let p = 0;
    if (t) {
        p = v / t;
    }
    return (p * 100).toFixed(digits) + unit;
};

const per = function(v, t = 1) {
    let p = 0;
    if (t) {
        p = v / t;
    }
    return p;
};

const num = function(str) {
    if (typeof(str) === "number" && !isNaN(str)) {
        return str;
    }
    let n = parseFloat(str + "");
    if (isNaN(n)) {
        return 0;
    }
    return n;
};

const int = function(str) {
    let n = num(str);
    return Math.round(n);
};

const getTimestamp = function(date = new Date(), option = {}) {
    option = Object.assign({
        weekday: "short",
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        timeZoneName: 'short'
    }, option);
    let timestamp = new Intl.DateTimeFormat('en-US', option).format(date);
    return timestamp;
};

const replace = function(str, obj, defaultValue) {
    str = str + "";
    if (!obj) {
        return str;
    }
    str = str.replace(/\{([^}{]+)\}/g, function(match, key) {
        if (!obj.hasOwnProperty(key)) {
            if (typeof(defaultValue) !== "undefined") {
                return defaultValue;
            }
            return match;
        }
        var val = obj[key];
        if (typeof(val) === "function") {
            val = val(obj, key);
        }
        if (typeof(val) === "undefined") {
            val = "";
        }
        return val;
    });
    return str;
};

const percentHandler = function(item) {
    if (item.subs) {
        item.selectable = true;
        item.subs.forEach(function(c) {
            c.conadd = int(c.conadd);
            c.econNum = int(c.econNum);
            c.deathNum = int(c.deathNum);
            c.cureNum = int(c.cureNum);
            c.value = int(c.value);
            c.econPercent = per(c.econNum, item.econNum);
            c.deathPercent = per(c.deathNum, c.value);
            c.curePercent = per(c.cureNum, c.value);
            percentHandler(c);
        });
    }
};

const getInfo = async () => {
    return new Promise((resolve) => {
        window.dataAPIData = function(d) {
            let data = d.data;
            resolve({
                mtime: data.mtime,
                chinaList: data.list,
                worldList: data.worldlist
            });
        };
        let rd = Math.random().toString().substr(2);
        const url = "https://gwpre.sina.cn/interface/fymap2020_data.json?_=" + rd + "&callback=dataAPIData";
        const script = document.createElement("script");
        script.src = url;
        script.onload = function() {
            console.log("jsonp onload");
        };
        script.onerror = function() {
            console.log("jsonp onerror");
            resolve();
        };
        document.body.appendChild(script);
    });
};

const getGridData = async () => {

    var info = await getInfo();

    let china = {
        conadd: 0,
        collapsed: true
    };

    const chinaList = info.chinaList.map(p => {
        if (Array.isArray(p.city)) {
            p.subs = p.city;
            delete p.city;
            p.subs.forEach(c => {
                if (!c.value) {
                    c.value = c.conNum;
                }
            });
        }
        let conadd = parseInt(p.conadd);
        if (!isNaN(conadd)) {
            china.conadd += conadd;
        }
        p.collapsed = true;
        return p;
    });

    const list = [];
    info.worldList.forEach(item => {
        if (item.name === "中国") {
            item.subs = chinaList;
            Object.assign(item, china);
        }
        if (!item.econNum) {
            item.econNum = item.value - int(item.deathNum) - int(item.cureNum);
        }
        list.push(item);
    });

    var total = {
        name: "全球",
        conadd: 0,
        econNum: 0,
        deathNum: 0,
        cureNum: 0,
        value: 0,
        subs: list
    };
    list.forEach(function(item) {
        total.conadd += int(item.conadd);
        total.econNum += int(item.econNum);
        total.deathNum += int(item.deathNum);
        total.cureNum += int(item.cureNum);
        total.value += int(item.value);
    });

    //total.econPercent = "";
    total.deathPercent = per(total.deathNum, total.value);
    total.curePercent = per(total.cureNum, total.value);

    percentHandler(total);

    var rows = [total];

    var columns = [{
        id: "tg_list_index",
        name: "",
        resizable: false,
        sortable: false,
        align: "right",
        width: 35,
        formatter: function(v, row) {
            if (!row.tg_parent) {
                return "";
            }
            return v + 1;
        }
    }, {
        id: "name",
        name: "地区",
        width: 110
    }, {
        id: "conadd",
        name: "新增",
        cellClass: "tg-cell-mask tg-bg-gray",
        headerItemClass: "tg-bg-gray",
        headerClass: "tg-bg-gray",
        dataType: "number"
    }, {
        id: "econNum",
        name: "现存",
        width: 80,
        dataType: "number"
    }, {
        id: "econPercent",
        name: "占比",
        align: "right",
        cellClass: "tg-border-right",
        headerItemClass: "tg-border-right",
        headerClass: "tg-border-right",
        dataType: "percent"
    }, {
        id: "deathNum",
        name: "死亡",
        dataType: "number"
    }, {
        id: "deathPercent",
        name: "死亡率",
        align: "right",
        cellClass: "tg-border-right",
        headerItemClass: "tg-border-right",
        headerClass: "tg-border-right",
        dataType: "percent"
    }, {
        id: "cureNum",
        name: "治愈",
        width: 80,
        dataType: "number"
    }, {
        id: "curePercent",
        name: "治愈率",
        align: "right",
        cellClass: "tg-border-right",
        headerItemClass: "tg-border-right",
        headerClass: "tg-border-right",
        dataType: "percent"
    }, {
        id: "value",
        name: "累计",
        width: 80,
        dataType: "number"
    }];

    const gridData = {
        mtime: info.mtime,
        option: {
            frozenColumn: 1,
            collapseAll: null,
            sortOnInit: true,
            convertDataType: true,
            sortAsc: false,
            scrollbarSize: 10,
            scrollbarFade: true,
            textSelectable: true,
            showRowNumber: false,
            rowNumberType: "list",
            sortField: ["econNum", "value"]
        },
        columns: columns,
        rows: rows
    };

    return gridData;
};

const TurboGrid = turbogrid.TurboGrid;
let grid;
const updateScrollShadow = function() {
    var view = grid.find(".tg-pane-top-left .tg-scrollview, .tg-pane-top-right .tg-scrollview");
    view.removeClass("tg-scroll-shadow-top tg-scroll-shadow-bottom");
    var scrollViewHeight = grid.getScrollViewHeight();
    if (scrollViewHeight < 60) {
        return;
    }
    var scrollTop = grid.getScrollTop();
    var rowsHeight = grid.getRowsHeight();
    var isTop = scrollTop < 30;
    var isBottom = rowsHeight - scrollTop - scrollViewHeight < 30;
    if (isTop) {
        view.addClass("tg-scroll-shadow-bottom");
    } else if (isBottom) {
        view.addClass("tg-scroll-shadow-top");
    } else {
        view.addClass("tg-scroll-shadow-top tg-scroll-shadow-bottom");
    }
};
const main = async () => {

    var gridData = await getGridData();

    const time = gridData.mtime || new Date().toLocaleDateString();
    const title = "COVID-19 Map (" + time + ")";
    document.title = title;

    let html = replace(template, {
        title: title,
        timestamp: getTimestamp()
    });

    var div = document.createElement("div");
    div.innerHTML = html;

    while (div.firstChild) {
        document.body.appendChild(div.firstChild);
    }

    var total = gridData.rows[0];

    grid = new TurboGrid(".grid");
    grid.bind("onClick", function(e, d) {
        this.unselectAll();
        var rowData = this.getRowItem(d.row);
        if (this.isRowSelectable(rowData)) {
            this.setSelectedRow(d.row, d.e);
        }
    });
    grid.bind("onScroll onRenderComplete", function(e, d) {
        updateScrollShadow();
    });
    grid.setOption({
        numberFormat: function(v) {
            if (typeof(v) === "number") {
                return v.toLocaleString();
            }
            return v;
        },
        percentFormat: function(v, row, column) {
            if (typeof(v) === "number") {
                var str = PF(v);
                if (column.id === "deathPercent" && row.value > 1000) {
                    if (v > total.deathPercent * 1.618) {
                        str = '<span class="color-red">' + str + '<span>';
                    } else if (v > total.deathPercent) {
                        str = '<span class="color-orange">' + str + '<span>';
                    }
                } else if (column.id === "curePercent" && row.value > 1000) {
                    if (v < total.curePercent * 0.382) {
                        str = '<span class="color-red">' + str + '<span>';
                    } else if (v < total.curePercent) {
                        str = '<span class="color-orange">' + str + '<span>';
                    } else if (v > 0.618) {
                        str = '<span class="color-green">' + str + '<span>';
                    }
                }
                return str;
            }
            return v;
        }
    });
    grid.setData(gridData);
    grid.render();

};

window.onresize = function() {
    if (grid) {
        grid.resize();
    }
};

window.onload = function() {
    main();
};
