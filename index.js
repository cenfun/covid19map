//const fs = require("fs");
const path = require("path");
const axios = require("axios");

const Util = require("./util.js");

const generateReport = async (data) => {
    console.log("generate report ...");

    const tempPath = path.resolve(__dirname, "template.html");
    const template = Util.readFileContentSync(tempPath);
    let html = Util.replace(template, {
        title: "COVID-19 Map " + new Date().toLocaleDateString(),
        timestamp: Util.getTimestamp()
    });

    let content = Util.getGridContent();
    content += "\nthis.gridData = " + JSON.stringify(data) + ";";
    /*inject:start*/
    /*inject:end*/
    const scriptBlock = /(([ \t]*)\/\*\s*inject:start\s*\*\/)(\r|\n|.)*?(\/\*\s*inject:end\s*\*\/)/gi;
    const hasScriptBlock = scriptBlock.test(html);
    if (hasScriptBlock) {
        const EOL = Util.getEOL();
        html = html.replace(scriptBlock, function(match) {
            const list = [arguments[1]].concat(content).concat(arguments[4]);
            const str = list.join(EOL + arguments[2]);
            return str;
        });
    }

    const htmlPath = path.resolve(__dirname, "./covid19map/index.html");
    Util.writeFileContentSync(htmlPath, html, true);

    Util.logCyan("generated report: " + Util.relativePath(htmlPath));

};

// const generateInfo = async () => {
//     const page = await Util.createPage({
//         //debug: true
//     });

//     const sourceUrl = "https://ncov.dxy.cn/ncovh5/view/pneumonia";
//     Util.logMsg("goto page: " + sourceUrl);
//     await page.goto(sourceUrl, {
//         timeout: 60 * 1000
//     });

//     await Util.delay(1000);

//     const info = await page.evaluate(async () => {

//         const addScriptTag = async () => {
//             return new Promise((resolve) => {
//                 window.dataAPIData = function(d) {
//                     console.log("jsonp data callback");
//                     resolve(d);
//                 };
//                 const rd = Math.random().toString().substr(2);
//                 const url = "https://gwpre.sina.cn/interface/fymap2020_data.json?_=" + rd + "&callback=dataAPIData";
//                 console.log("addScriptTag: " + url);
//                 const script = document.createElement("script");
//                 script.src = url;
//                 script.onload = function() {
//                     console.log("onload");
//                 };
//                 script.onerror = function(e) {
//                     console.log("onerror", e);
//                 };
//                 document.body.appendChild(script);
//             });
//         };

//         var d = await addScriptTag();
//         if (!d) {
//             console.log("Not found: jsonp data");
//             return;
//         }

//         var items = {
//             getListByCountryTypeService2true: "totalList",
//             getAreaStat: "chinaList"
//         };
//         var data = {
//             list: d.data.list,
//             worldList: d.data.worldlist
//         };
//         for (let k in items) {
//             if (!Array.isArray(window[k])) {
//                 console.log("Not found: window." + k);
//                 return;
//             }
//             data[items[k]] = window[k];
//         }
//         return data;
//     });

//     //console.log(info);

//     await Util.closeBrowser();

//     return info;
// };

//https://news.sina.cn/zt_d/yiqing0121

const requestInfo = async () => {
    const url = "https://gwpre.sina.cn/interface/fymap2020_data.json";
    let d = await axios.get(url);
    let data = d.data.data;
    return {
        chinaList: data.list,
        worldList: data.worldlist
    };
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

const getGridData = (info) => {

    let china = {
        conadd: 0,
        collapsed: true
    };

    const chinaList = info.chinaList.map(p => {
        if (Array.isArray(p.city)) {
            p.subs = p.city;
            delete p.city;
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
        id: "name",
        name: "地区",
        width: 120
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
        dataType: "number"
    }, {
        id: "econPercent",
        name: "现存比",
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
        dataType: "number"
    }];

    const gridData = {
        option: {
            frozenColumn: 0,
            collapseAll: null,
            sortOnInit: true,
            convertDataType: true,
            sortAsc: false,
            showRowNumber: false,
            rowNumberType: "list",
            sortField: ["econNum", "value"]
        },
        columns: columns,
        rows: rows
    };

    return gridData;
};

const main = async () => {
    let info = await requestInfo();
    if (!info) {
        console.log("ERROR: Fail to load info");
        return;
    }
    const tempPath = Util.getTempRoot();
    Util.writeJSONSync(tempPath + "/info.json", info, true);
    const data = getGridData(info);
    Util.writeJSONSync(tempPath + "/grid-data.json", data, true);
    await generateReport(data);
};

main();
