//https://mochajs.org/
//https://nodejs.org/api/assert.html
var assert = require('assert');
var Component = require("../../src");
describe('my suite name', function() {
    it('case name', function() {
        assert.ok(Component);
    });
});
