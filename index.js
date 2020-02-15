//const fs = require("fs");
const path = require("path");
const Util = require("./util.js");

const sourceUrl = "https://ncov.dxy.cn/ncovh5/view/pneumonia";


const generateReport = async (data) => {
    console.log("generate report ...");

    const tempPath = path.resolve(__dirname, "template.html");
    const template = Util.readFileContentSync(tempPath);
    let html = Util.replace(template, {
        title: "Cov2 Map " + new Date().toLocaleDateString(),
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

    const htmlPath = path.resolve(__dirname, "cov2map.html");
    Util.writeFileContentSync(htmlPath, html, true);

    Util.logCyan("generated report: " + Util.relativePath(htmlPath));

};

const generateList = async (listPath) => {
    const page = await Util.createPage({
        //debug: true
    });
    Util.logMsg("goto page: " + sourceUrl);
    await page.goto(sourceUrl, {
        timeout: 60 * 1000
    });

    await Util.delay(1000);

    const list = await page.evaluate(() => {
        return window.getAreaStat;
    });

    await Util.closeBrowser();

    if (Util.isList(list)) {
        Util.writeJSONSync(listPath, list, true);
        return list;
    }
    console.log("ERROR: Fail to load list");

};

const main = async () => {

    const tempPath = Util.getTempRoot();

    const listPath = tempPath + "/cov2-list.json";
    let list = Util.readJSONSync(listPath);
    if (!list) {
        list = await generateList(listPath);
    }

    if (!list) {
        return;
    }

    //parse data
    list = list.map(p => {
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

    const data = {
        rows: list
    };

    Util.writeJSONSync(tempPath + "/grid-data.json", data, true);

    await generateReport(data);

};


main();
