const fs = require('fs');
const path = require('path');
const os = require("os");
const JSON5 = require('json5');
const shelljs = require('shelljs');
const ConsoleGrid = require('console-grid');
const MPW = require('multi-process-worker');
const PCR = require('puppeteer-chromium-resolver');

//'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'
const CGS = ConsoleGrid.Style;
const consoleGrid = new ConsoleGrid();


const Util = {
    CGS: CGS,
    consoleGrid: consoleGrid,

    root: __dirname,
    nmRoot: __dirname,

    workerLength: 0,
    jobLength: 0,

    // \ to /
    formatPath: function(str) {
        if (str) {
            str = str.replace(/\\/g, "/");
        }
        return str;
    },

    relativePath: function(p) {
        var rp = path.relative(Util.root, p);
        rp = Util.formatPath(rp);
        return rp;
    },

    getTempRoot: function() {
        if (Util.tempRoot) {
            return Util.tempRoot;
        }

        //init temp output
        var tempPath = ".temp";
        Util.tempRoot = Util.formatPath(path.resolve(Util.root, tempPath));
        if (!fs.existsSync(Util.tempRoot)) {
            shelljs.mkdir('-p', Util.tempRoot);
        }

        return Util.tempRoot;
    },

    require: function(filePath) {
        //console.log("require conf path: " + filePath);
        var isExists = fs.existsSync(filePath);
        if (isExists) {
            var fileModule = require(filePath);
            //console.log("fileModule", fileModule);
            return fileModule;
        }
        return null;
    },


    isDebugging: () => {
        const debugArgRegex = /--inspect(?:-brk|-port)?|--debug-port/;
        let execArgv = process.execArgv.slice();
        if (execArgv.some((arg) => arg.match(debugArgRegex))) {
            return true;
        }
        return false;
    },

    //============================================================================

    //default to true
    getMultiprocessing: (jobName) => {
        var multiprocessing = Util.getConfItem("hs", "multiprocessing");
        if (multiprocessing && typeof(multiprocessing) === "object") {
            multiprocessing = multiprocessing[jobName];
        }

        if (multiprocessing === false) {
            return false;
        }

        if (Util.isNum(multiprocessing) && multiprocessing > 0) {
            return Math.ceil(multiprocessing);
        }

        return true;
    },

    startWorker: async (option) => {

        //init workerLength
        if (Util.isDebugging()) {
            //debug mode
            console.log(CGS.yellow("multiprocessing disabled in debugging"));
            option.workerLength = 1;
        }

        //test 
        //option.workerLength = 16;

        option.onStart = async (option) => {
            Util.workerLength = option.workerLength;
            Util.jobLength = option.jobLength;
            option.workerOption = Util.getWorkerOption();
        };

        option.onJobStart = async (job) => {
            console.log("start " + job.jobId + ": " + job.jobName + " " + job.name);
        };

        option.onJobFinish = async (job) => {
            console.log("finish " + job.jobId + ": " + job.jobName + " " + job.name + " and cost " + job.duration.toLocaleString() + "ms");
        };

        var reportHandler = option.reportHandler;
        option.onFinish = async (option) => {
            //report handler
            if (typeof(reportHandler) === "function") {
                delete option.reportHandler;
                await reportHandler(option);
            }

            if (option.code !== 0) {
                //exit error
                if (option.exitError) {
                    Util.logRed(option.exitError);
                }
                Util.logRed(option.name + ': jobs stopped with error: ' + option.code);
            }
        };

        return await MPW(option);
    },

    getWorkerOption: function(option) {
        var workerOption = Object.assign({
            workerLength: Util.workerLength,
            jobLength: Util.jobLength
        }, option);
        return workerOption;
    },

    setWorkerOption: function(workerOption) {
        //require workerOption workerId
        for (var k in workerOption) {
            Util[k] = workerOption[k];
        }
    },

    //init sub process
    initWorker: function(workerHandler) {
        process.on('message', async (message) => {
            if (message.type === "workerStart") {
                Util.setWorkerOption(message.data);
                process.send({
                    type: "workerOnline"
                });
                return;
            }
            if (message.type === "jobStart") {
                let job = message.data;
                Util.jobId = job.jobId;
                Util.jobName = job.jobName;
                job.code = await workerHandler(job);
                process.send({
                    type: "jobFinish",
                    data: job
                });
                return;
            }
        });
    },

    pageLogHandler: function(msg, type) {
        if (type === "ERROR") {
            type = CGS.red(type);
        } else if (type === "WARNING") {
            type = CGS.yellow(type);
        }

        let detail = CGS.magenta("[PAGE " + type + "] ");

        let text = msg.text();

        detail += text;

        const loc = msg.location();
        if (loc.url) {
            detail += " (" + loc.url;
            if (loc.lineNumber) {
                detail += ":" + loc.lineNumber;
            }
            if (loc.columnNumber) {
                detail += ":" + loc.columnNumber;
            }
            detail += ")";
        }

        console.log(detail);
    },

    createPage: async (config = {}, browserOption = {}, resolverOption = {}) => {
        if (config.debug || Util.isDebugging()) {
            browserOption.headless = false;
            var slowMo = parseInt(config.debug);
            if (slowMo) {
                slowMo = Math.max(1, slowMo);
                slowMo = Math.min(1000, slowMo);
                browserOption.slowMo = slowMo;
            }
        }
        const browser = await Util.launchBrowser(browserOption, resolverOption);
        const page = await browser.newPage();
        global.page = page;

        page.setDefaultTimeout(10 * 1000);

        page.on('console', (msg) => {
            var type = msg.type().toUpperCase();
            //remove debug msg
            if (type === "DEBUG" || type === "INFO" || type === "WARNING") {
                return;
            }
            Util.pageLogHandler(msg, type);
        });


        Util.logMsg("[page]", "created success");
        await Util.delay(500);
        return global.page;
    },

    addPageScript: async (page, script) => {
        const has = await page.evaluate(function() {
            if (window.delay && window.ready) {
                return true;
            }
            return false;
        });
        if (has) {
            return;
        }
        await page.addScriptTag({
            path: script
        });
    },

    closeBrowser: async () => {
        if (!global.page) {
            return;
        }
        console.log("close browser ...");
        const browser = global.page.browser();
        global.page = null;
        await browser.close();
    },

    launchBrowser: async (browserOption = {}, resolverOption = {}) => {

        Util.logMsg("[browser]", "launch ...");
        //tab height 80, 980-80=900
        //scrollbar width 20, 1280-20=1260
        //https://peter.sh/experiments/chromium-command-line-switches/
        browserOption = Object.assign({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1280,980',
                '--window-position=0,0'
            ],
            ignoreDefaultArgs: [
                '--enable-automation'
            ],
            defaultViewport: {
                width: 1260,
                height: 900
            }
        }, browserOption);

        if (!Util.puppeteer) {
            var pcr = await PCR(resolverOption);
            if (!pcr.launchable) {
                Util.logRed("[browser] Failed to launch browser");
                return;
            }
            Util.puppeteer = pcr.puppeteer;
            Util.executablePath = pcr.executablePath;
        }

        browserOption.executablePath = Util.executablePath;
        const browser = await Util.puppeteer.launch(browserOption);
        const chromiumVersion = await browser.version();
        Util.logMsg("[browser]", "version: " + chromiumVersion);
        Util.logMsg("[browser]", CGS.green("launch success"));

        return browser;
    },

    //============================================================================

    async readdir(p) {
        return new Promise((resolve) => {
            fs.readdir(p, (err, list) => {
                if (err) {
                    resolve([]);
                    return;
                }
                resolve(list);
            });
        });
    },

    async stat(p) {
        return new Promise((resolve) => {
            fs.lstat(p, (err, stats) => {
                if (err) {
                    resolve(null);
                    return;
                }
                resolve(stats);
            });
        });
    },

    forEachTree: function(tree, callback) {
        if (!tree) {
            return;
        }
        Object.keys(tree).forEach(function(item) {
            Util.forEachTree(tree[item], callback);
            callback(item);
        });
    },

    forEachFile: function(p, extList, callback) {
        var list = fs.readdirSync(p);
        list.forEach(function(fileName) {
            var info = fs.statSync(p + "/" + fileName);
            if (info.isDirectory()) {
                Util.forEachFile(p + "/" + fileName, extList, callback);
            } else {
                var extname = path.extname(fileName);
                if (!extList.length || Util.inList(extname, extList)) {
                    callback(fileName, p);
                }
            }
        });
    },

    deleteFolder: function(path) {
        if (fs.existsSync(path)) {
            var files = fs.readdirSync(path);
            files.forEach(function(file, index) {
                var curPath = path + "/" + file;
                if (fs.statSync(curPath).isDirectory()) {
                    this.deleteFolder(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    },

    editFile: function(path, callback) {
        var content = Util.readFileContentSync(path);
        content = callback.call(this, content);
        Util.writeFileContentSync(path, content);
    },

    editJSON: function(path, callback) {
        var json = Util.readJSONSync(path);
        json = callback.call(this, json);
        Util.writeJSONSync(path, json);
    },

    readFileContentSync: function(filePath) {
        var content = null;
        var isExists = fs.existsSync(filePath);
        if (isExists) {
            content = fs.readFileSync(filePath);
            if (Buffer.isBuffer(content)) {
                content = content.toString('utf8');
            }
        }
        return content;
    },

    writeFileContentSync: function(filePath, content, force) {
        var isExists = fs.existsSync(filePath);
        if (force || isExists) {
            fs.writeFileSync(filePath, content);
            return true;
        }
        return false;
    },

    //============================================================================

    readJSONSync: function(filePath) {
        //do NOT use require, it has cache
        var content = Util.readFileContentSync(filePath);
        var json = null;
        if (content) {
            json = JSON5.parse(content);
        }
        return json;
    },

    writeJSONSync: function(filePath, json, force) {
        var content = Util.jsonString(json, 4);
        if (!content) {
            Util.logRed("Invalid JSON object");
            return false;
        }
        //end of line
        var EOL = Util.getEOL();
        content = content.replace(/\r|\n/g, EOL);
        content += EOL;
        return Util.writeFileContentSync(filePath, content, force);
    },

    jsonParse: function(str) {

        if (typeof(str) !== "string") {
            return str;
        }

        if (!str) {
            return null;
        }

        var json = null;

        //remove BOM \ufeff
        str = str.replace(/^\uFEFF/, '');

        //remove comments
        var reg = /("([^\\"]*(\\.)?)*")|('([^\\']*(\\.)?)*')|(\/{2,}.*?(\r|\n))|(\/\*(\n|.)*?\*\/)/g;
        str = str.replace(reg, function(word) {
            return /^\/{2,}/.test(word) || /^\/\*/.test(word) ? "" : word;
        });

        str = str.replace(/\r/g, "");
        str = str.replace(/\n/g, "");

        try {
            json = JSON.parse(str);
        } catch (e) {
            console.log(e);
        }

        return json;
    },

    jsonString: function(obj, spaces) {

        if (typeof(obj) === "string") {
            return obj;
        }

        if (!spaces) {
            spaces = 2;
        }

        var str = "";
        try {
            str = JSON.stringify(obj, null, spaces);
        } catch (e) {
            console.log(e);
        }

        return str;
    },

    getEOL: function(content) {
        if (!content) {
            return os.EOL;
        }
        var nIndex = content.lastIndexOf("\n");
        if (nIndex === -1) {
            return os.EOL;
        }
        if (content.substr(nIndex - 1, 1) === "\r") {
            return "\r\n";
        }
        return "\n";
    },

    generateGUID: function() {
        return [8, 4, 4, 4, 12].map(function(idx) {
            var double = idx * 2;
            return Math.ceil(Math.random() * parseFloat("1e" + (double > 18 ? 18 : double)))
                .toString(16)
                .substring(0, idx);
        }).join("-");
    },

    getGridContent: function() {
        const gridFile = "turbogrid/dist/turbogrid.js";
        return Util.readFileContentSync(Util.nmRoot + "/node_modules/" + gridFile);
    },

    getTemplate: function(templatePath) {
        if (!Util.templateCache) {
            Util.templateCache = {};
        }
        let template = Util.templateCache[templatePath];
        if (!template) {
            template = Util.readFileContentSync(templatePath);
            if (template) {
                Util.templateCache[templatePath] = template;
            } else {
                Util.logRed("ERROR: Not found template: " + templatePath);
            }
        }
        return template;
    },

    removeColor: function(char) {
        return (char + "").replace(/\033\[(\d+)m/g, '');
    },

    addColor: function(text, color, html) {
        if (html) {
            return '<span style="color:' + color + ';">' + text + '</span>';
        }
        var colorNameMap = {
            orange: "yellow"
        };
        color = colorNameMap[color] || color;
        var fn = CGS[color];
        if (typeof(fn) === "function") {
            return fn(text);
        }
        return text;
    },

    //============================================================================

    logMsg: function() {
        var logs = [];
        var greenList = [{
            type: "workerId",
            length: "workerLength",
            name: "worker"
        }, {
            type: "jobId",
            length: "jobLength",
            name: "job"
        }];
        greenList.forEach((item) => {
            var v = Util[item.type];
            if (v) {
                v = v + "";
                var l = (Util[item.length] + "").length;
                var str = v.padStart(l, " ");
                logs.push(CGS.bg.green("[" + item.name + str + "]"));
            }
        });
        for (var i = 0, l = arguments.length; i < l; i++) {
            var v = arguments[i];
            if (i === l - 1) {
                logs.push(v);
            } else {
                logs.push(CGS.magenta(v));
            }

        }
        var msg = logs.join(" ");
        console.log(msg);
        return msg;
    },

    logWorker: function() {
        var list = [];
        if (Util.jobName) {
            list.push(Util.jobName);
        }
        if (Util.componentName) {
            list.push(Util.componentName);
        }
        if (arguments.length) {
            list.push(arguments[0]);
        }
        return Util.logMsg.apply(Util, list);
    },

    logLine: function(before = "", after = "") {
        var msg = "";
        if (before) {
            msg += before + "\n";
        }
        msg += "==============================================================";
        if (after) {
            msg += "\n" + after;
        }
        console.log(msg);
        return msg;
    },


    logStart: function(msg) {
        return Util.logLine("", msg + "\n");
    },

    logEnd: function(msg) {
        return Util.logLine("\n" + msg, "\n");
    },

    logColor: function(color, msg) {
        var fn = CGS[color];
        if (typeof(fn) === "function") {
            msg = fn(msg);
        }
        console.log(msg);
        return msg;
    },

    logRed: function(msg) {
        return Util.logColor("red", msg);
    },

    logYellow: function(msg) {
        return Util.logColor("yellow", msg);
    },

    logGreen: function(msg) {
        return Util.logColor("green", msg);
    },

    logCyan: function(msg) {
        return Util.logColor("cyan", msg);
    },

    logList: function(list, force) {
        if (list.length < 2 && !force) {
            console.log(list);
            return list;
        }
        var rows = [];
        list.forEach((item, i) => {
            rows.push({
                index: i + 1,
                name: item
            });
        });
        return consoleGrid.render({
            option: {},
            columns: [{
                id: "index",
                name: "No.",
                type: "number",
                maxWidth: 5
            }, {
                id: "name",
                name: "Name"
            }],
            rows: rows
        });
    },

    logObject: function(obj, align) {
        var rows = [];
        var forEachAll = (obj, list) => {
            for (var name in obj) {
                var value = obj[name];
                var item = {
                    name: name,
                    value: value
                };
                if (value && typeof(value) === "object") {
                    item.value = "";
                    item.subs = [];
                    forEachAll(value, item.subs);
                }
                list.push(item);
            }
        };
        forEachAll(obj, rows);

        return consoleGrid.render({
            option: {
                hideHeaders: true
            },
            columns: [{
                id: "name",
                maxWidth: 300,
                align: align ? align : ""
            }, {
                id: "value",
                maxWidth: 300
            }],
            rows: rows
        });
    },

    //============================================================================
    //string
    token: function(len) {
        var str = Math.random().toString().substr(2);
        if (len) {
            str = str.substr(0, Util.toNum(len));
        }
        return str;
    },

    replace: function(str, obj, defaultValue) {
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
    },

    zero: function(s, l = 2) {
        s = s + "";
        return s.padStart(l, "0");
    },

    //============================================================================
    //number
    isNum: function(num) {
        if (typeof(num) !== "number" || isNaN(num)) {
            return false;
        }
        var isInvalid = function(n) {
            if (n === Number.MAX_VALUE || n === Number.MIN_VALUE || n === Number.NEGATIVE_INFINITY || n === Number.POSITIVE_INFINITY) {
                return true;
            }
            return false;
        };
        if (isInvalid(num)) {
            return false;
        }
        return true;
    },

    // format to a valid number
    toNum: function(num, toInt) {
        if (typeof(num) !== "number") {
            num = parseFloat(num);
        }
        if (isNaN(num)) {
            num = 0;
        }
        if (toInt) {
            num = Math.round(num);
        }
        return num;
    },

    clamp: function(num, min, max) {
        return Math.max(Math.min(num, max), min);
    },

    //============================================================================
    //date
    isDate: function(date) {
        if (!date || !(date instanceof Date)) {
            return false;
        }
        //is Date Object but Date {Invalid Date}
        if (isNaN(date.getTime())) {
            return false;
        }
        return true;
    },

    toDate: function(input) {
        if (Util.isDate(input)) {
            return input;
        }
        //fix time zone issue by use "/" replace "-"
        var inputHandler = function(input) {
            if (typeof(input) !== "string") {
                return input;
            }
            input = input.split("-").join("/");
            return input;
        };
        input = inputHandler(input);
        var date = new Date(input);
        if (Util.isDate(date)) {
            return date;
        }
        date = new Date();
        return date;
    },

    dateFormat: function(date, format) {
        date = Util.toDate(date);
        //default format
        format = format || "yyyy-MM-dd";
        //year
        if (/([Y|y]+)/.test(format)) {
            var yyyy = date.getFullYear() + "";
            format = format.replace(RegExp.$1, yyyy.substr(4 - RegExp.$1.length));
        }
        var o = {
            "M+": date.getMonth() + 1,
            "[D|d]+": date.getDate(),
            "[H|h]+": date.getHours(),
            "m+": date.getMinutes(),
            "s+": date.getSeconds(),
            "[Q|q]+": Math.floor((date.getMonth() + 3) / 3),
            "S": date.getMilliseconds()
        };
        var doubleNumberHandler = function() {
            for (var k in o) {
                if (o.hasOwnProperty(k)) {
                    var reg = new RegExp("(" + k + ")").test(format);
                    if (!reg) {
                        continue;
                    }
                    var str = o[k] + "";
                    format = format.replace(RegExp.$1, (RegExp.$1.length === 1) ? str : ("00" + str).substr(str.length));
                }
            }
        };
        doubleNumberHandler();
        return format;
    },

    getTimestamp: function(date = new Date(), option = {}) {
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
    },

    //============================================================================
    //array
    isList: function(data) {
        if (data && data instanceof Array && data.length > 0) {
            return true;
        }
        return false;
    },

    inList: function(item, list) {
        if (!Util.isList(list)) {
            return false;
        }
        for (var i = 0, l = list.length; i < l; i++) {
            if (list[i] === item) {
                return true;
            }
        }
        return false;
    },

    toList: function(data, separator) {
        if (data instanceof Array) {
            return data;
        }
        if (typeof(data) === "string" && (typeof(separator) === "string" || separator instanceof RegExp)) {
            return data.split(separator);
        }
        if (typeof(data) === "undefined" || data === null) {
            return [];
        }
        return [data];
    },

    isMatch: function(item, attr) {
        if (item === attr) {
            return true;
        }
        if (item && attr && typeof(attr) === "object") {
            for (var k in attr) {
                if (item[k] !== attr[k]) {
                    return false;
                }
            }
            return true;
        }
        return false;
    },

    getListItem: function(list, attr) {
        if (Util.isList(list)) {
            for (var i = 0, l = list.length; i < l; i++) {
                var item = list[i];
                if (Util.isMatch(item, attr)) {
                    return item;
                }
            }
        }
        return null;
    },

    delListItem: function(list, attr) {
        if (!Util.isList(list)) {
            return list;
        }
        var matchIndexList = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (Util.isMatch(item, attr)) {
                matchIndexList.push(i);
            }
        }
        matchIndexList.reverse();
        matchIndexList.forEach(function(index) {
            list.splice(index, 1);
        });
        return list;
    },

    //============================================================================
    //object
    getValue: function(data, dotPathStr, defaultValue) {
        if (!dotPathStr) {
            return defaultValue;
        }
        var current = data;
        var list = dotPathStr.split(".");
        var lastKey = list.pop();
        while (current && list.length) {
            var item = list.shift();
            current = current[item];
        }
        if (current && current.hasOwnProperty(lastKey)) {
            var value = current[lastKey];
            if (typeof(value) !== "undefined") {
                return value;
            }
        }
        return defaultValue;
    },

    //============================================================================
    //async
    delay: function(ms) {
        return new Promise((resolve) => {
            if (ms) {
                setTimeout(resolve, ms);
            } else {
                setImmediate(resolve);
            }
        });
    },

    //============================================================================
    //formatters

    //byte
    BF: function(v, digits = 1, base = 1024) {
        v = Util.toNum(v, true);
        if (v === 0) {
            return "0B";
        }
        let prefix = "";
        if (v < 0) {
            v = Math.abs(v);
            prefix = "-";
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        for (let i = 0, l = units.length; i < l; i++) {
            let min = Math.pow(base, i);
            let max = Math.pow(base, i + 1);
            if (v > min && v < max) {
                let unit = units[i];
                v = prefix + (v / min).toFixed(digits) + unit;
                break;
            }
        }
        return v;
    },

    //percent
    PF: function(v, t = 1, digits = 1, unit = "%") {
        v = Util.toNum(v);
        t = Util.toNum(t);
        let per = 0;
        if (t) {
            per = v / t;
        }
        return (per * 100).toFixed(digits) + unit;
    },

    //time
    TF: function(v, unit, digits = 1) {
        v = Util.toNum(v, true);
        if (unit) {
            if (unit === "s") {
                v = (v / 1000).toFixed(digits);
            } else if (unit === "m") {
                v = (v / 1000 / 60).toFixed(digits);
            } else if (unit === "h") {
                v = (v / 1000 / 60 / 60).toFixed(digits);
            }
            return Util.NF(v) + unit;
        }
        const s = v / 1000;
        const hours = Math.floor(s / 60 / 60);
        const minutes = Math.floor((s - (hours * 60 * 60)) / 60);
        const seconds = Math.round(s - (hours * 60 * 60) - (minutes * 60));
        const time = hours + ':' + Util.zero(minutes) + ':' + Util.zero(seconds);
        return time;
    },

    //number
    NF: function(v) {
        v = Util.toNum(v);
        return v.toLocaleString();
    }

};

module.exports = Util;
