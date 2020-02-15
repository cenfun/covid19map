module.exports = {
    //system globals
    "env": {
        "node": true,
        "browser": true,
        "amd": true,
        "commonjs": true,
        "es6": true,
        "jquery": true,
        "mocha": true
    },
    //other globals
    "globals": {
        "assert": true
    },

    "extends": [
        "eslint:recommended"
    ],

    //should "npm install eslint-plugin-es -g" for VSCode in global
    "plugins": [
        //"es"
    ],

    "root": true,

    "parserOptions": {
        //set to 3, 5 (default), 6, 7, 8, 9, or 10 to specify the version of ECMAScript syntax you want to use. 
        //2015 (same as 6), 2016 (same as 7), 2017 (same as 8), 2018 (same as 9), or 2019 (same as 10) to use the year-based naming.
        "ecmaVersion": 2018,
        "sourceType": "module"
    },


    //https://eslint.org/docs/4.0.0/rules/

    "rules": {

        //disabled rules for IE11 (https://mysticatea.github.io/eslint-plugin-es/)
        //"es/no-for-of-loops": "error",
        //"es/no-set": "error",
        //"es/no-map": "error",

        "no-console": "off",

        "no-empty": "off",

        "no-unused-vars": ["error", {
            "vars": "local",
            "args": "none"
        }],

        "no-constant-condition": ["error", {
            "checkLoops": false
        }],

        //"no-bitwise": "error",
        "no-eq-null": "error",
        "no-eval": "error",

        //"strict": ["warn", "global"],

        //https://eslint.org/docs/4.0.0/rules/new-cap
        //"new-cap":[],

        "curly": "error",
        "eqeqeq": ["error", "always"],

        "max-params": ["error", 8],
        "max-depth": ["error", 4],
        "max-statements": ["error", 50],
        "complexity": ["error", 8],
        "max-len": ["error", 200],
        "max-nested-callbacks": ["error", 3],

        //disable for eslint 6 default
        "no-prototype-builtins": "off",
        "require-atomic-updates": "off",

        "indent": ["error", 4, {
            "SwitchCase": 1,
            "ArrayExpression": "first",
            "ObjectExpression": 1
        }],

        "semi": [
            "error",
            "always"
        ]
    }
};
