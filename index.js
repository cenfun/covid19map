//const fs = require("fs");
const path = require("path");
const Util = require("./util.js");

const sourceUrl = "https://ncov.dxy.cn/ncovh5/view/pneumonia";

//https://gwpre.sina.cn/interface/fymap2020_data.json?_=1584782003619&callback=dataAPIData

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

const generateInfo = async (infoPath) => {
    const page = await Util.createPage({
        //debug: true
    });
    Util.logMsg("goto page: " + sourceUrl);
    await page.goto(sourceUrl, {
        timeout: 60 * 1000
    });

    await Util.delay(1000);

    const info = await page.evaluate(() => {
        var items = {
            "getListByCountryTypeService2true": "totalList",
            "getAreaStat": "chinaList"
        };
        var data = {};
        for (let k in items) {
            if (!Array.isArray(window[k])) {
                console.log("Not found: window." + k);
                return;
            }
            data[items[k]] = window[k];
        }
        return data;
    });

    //console.log(info);

    await Util.closeBrowser();

    if (info) {
        Util.writeJSONSync(infoPath, info, true);
        return info;
    }

    console.log("ERROR: Fail to load info");

};

const main = async () => {

    const tempPath = Util.getTempRoot();

    const infoPath = tempPath + "/covid19-info.json";
    //let info = Util.readJSONSync(infoPath);
    //if (!info) {
    let info = await generateInfo(infoPath);
    //}

    if (!info) {
        return;
    }

    //parse data
    const chinaList = info.chinaList.map(p => {
        p.name = p.provinceShortName;
        delete p.provinceName;
        delete p.provinceShortName;
        delete p.comment;
        delete p.suspectedCount;
        if (Array.isArray(p.cities)) {
            p.subs = p.cities;
            p.subs = p.subs.map(c => {
                c.name = c.cityName;
                delete c.cityName;
                delete p.suspectedCount;
                return c;
            });
            delete p.cities;
        }
        return p;
    });

    const china = {
        name: "中国",
        currentConfirmedCount: 0,
        confirmedCount: 0,
        suspectedCount: 0,
        curedCount: 0,
        deadCount: 0,
        subs: chinaList
    };

    chinaList.forEach(c => {
        china.currentConfirmedCount += c.currentConfirmedCount;
        china.confirmedCount += c.confirmedCount;
        china.suspectedCount += c.suspectedCount;
        china.curedCount += c.curedCount;
        china.deadCount += c.deadCount;
    });


    const totalList = [china];
    info.totalList.forEach(item => {
        const c = {
            name: item.provinceName,
            currentConfirmedCount: item.currentConfirmedCount,
            confirmedCount: item.confirmedCount,
            suspectedCount: item.suspectedCount,
            curedCount: item.curedCount,
            deadCount: item.deadCount,
        };
        if (c.name === "中国") {
            return;
        }
        totalList.push(c);
    });


    const data = {
        rows: totalList
    };

    Util.writeJSONSync(tempPath + "/grid-data.json", data, true);

    await generateReport(data);

};


main();
