//const fs = require("fs");
const path = require("path");

module.exports = {

    preCommit: false,

    hooks: {

        "covid": {
            beforeBuild: async (item, Util) => {
                //console.log(item);
                item.beforeBuild = true;
                return 0;
            },

            afterBuild: async (item, Util) => {

                console.log("generate report ...");

                const tempPath = path.resolve(__dirname, "template.html");
                let html = Util.readFileContentSync(tempPath);

                const jsFile = path.resolve(__dirname, "packages/covid/dist/covid.js");
                let content = Util.readFileContentSync(jsFile);
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

                return 0;
            }
        }

    }

};
