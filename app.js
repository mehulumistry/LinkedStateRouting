"use strict";
exports.__esModule = true;
var uuidV4 = require("uuid/v4");
var fs = require("graceful-fs");
var prompt_f = require("prompt-sync");
var prompt = prompt_f();
var app = /** @class */ (function () {
    function app() {
    }
    app.main = function () {
        this.initRoutersByFile();
        //this.routers[2].status = "stop";
        while (true) {
            console.log("\n C : continue\n Q : quit\n P followed by the routers id number: print the routing table of a router\n S followed by the id number: shut down a router\n T followed by the id : start up a router\n please enter your choice:");
            var p = prompt('');
            if (p.toLowerCase() == "c") {
                for (var i = 0; i < 2; i++) {
                    for (var prop in this.routers) {
                        this.routers[prop].originatePacket();
                    }
                }
            }
            else if (p.toLowerCase() == "q") {
                break;
            }
            else if (p.charAt(0).toLowerCase() == "p") {
                if (this.routers[p.charAt(1)].status == "start") {
                    console.log(this.routers[p.charAt(1)].routing_table);
                }
                else {
                    console.log(p + " is shutdown now");
                }
            }
            else if (p.charAt(0).toLowerCase() == "s") {
                this.routers[p.charAt(1)].status = "stop";
            }
            else if (p.charAt(0).toLowerCase() == "t") {
                this.routers[p.charAt(1)].status = "start";
            }
        }
    };
    /*
    * parse input and init routers
    */
    app.initRoutersByFile = function () {
        var input = fs.readFileSync("infile.dat", "utf8");
        var input_arr = input.split("\n");
        var new_router;
        for (var i in input_arr) {
            var input_line = input_arr[i];
            var input_line_arr = input_arr[i].split(/\s+/);
            if (input_line_arr[0] !== '') {
                new_router = new router();
                new_router.id = input_line_arr[0];
                new_router.network = input_line_arr[1];
                if (input_line_arr[2] != undefined) {
                    new_router.network_cost = input_line_arr[2];
                }
                else {
                    new_router.network_cost = 1;
                }
                this.routers[new_router.id] = new_router;
            }
            else {
                if (input_line_arr[2] != undefined) {
                    this.routers[new_router.id].connected_routers_list[input_line_arr[1]] = input_line_arr[2];
                }
                else {
                    this.routers[new_router.id].connected_routers_list[input_line_arr[1]] = 1;
                }
            }
        }
    };
    app.routers = {};
    return app;
}());
exports.app = app;
var router = /** @class */ (function () {
    function router() {
        this.TICK_CHECK = 1;
        this.cost = null;
        this.id = null;
        this.status = "start";
        this.network = null;
        this.network_cost = null;
        this.tick = 0;
        this.connected_routers_list = {};
        this.packets_copy = null;
        this.ori_packet = null;
        this.sequence = 0;
        this.recieved_list = {};
        this.ohsr_list = {};
        this.adjacent_list = {};
        this.router_network_mapping = {};
        this.routing_table = {};
    }
    router.prototype.receivePacket = function (packet) {
        if (this.status === "start") {
            packet.TTL = packet.TTL - 1;
            if (!this.checkDiscard(packet)) {
                this.piecePuzzleTogether(packet);
                SPF.init(this.id, this.adjacent_list);
                SPF.computeSPF();
                this.updateRoutingTable();
                //console.log(this.id,this.routing_table);
                //flooding
                for (var prop in this.connected_routers_list) {
                    var new_packet = this.copyPacket(packet);
                    //if(prop != packet.send_from && prop != packet.router_id){
                    new_packet.send_from = this.id;
                    if (app.routers[prop].receivePacket(new_packet) == true) {
                        if (this.recieved_list[this.tick] == undefined) {
                            this.recieved_list[this.tick] = {};
                        }
                        this.recieved_list[this.tick][prop] = 1;
                    }
                    // }
                }
                //console.log(this.adjacent_list);
            }
            else {
                //console.log("discard:",packet.id);
            }
            return true;
        }
        else {
            return false;
        }
    };
    router.prototype.originatePacket = function () {
        if (this.status === "start") {
            this.generateLSP();
            this.tick = this.tick + 1;
            this.recieved_list[this.tick] = {};
            for (var prop in this.connected_routers_list) {
                var new_packet = this.copyPacket(this.ori_packet);
                new_packet.send_from = this.id;
                if (app.routers[prop].receivePacket(new_packet) == true) {
                    this.recieved_list[this.tick][prop] = 1;
                }
            }
            if (this.tick >= this.TICK_CHECK) {
                this.checkTicks();
            }
        }
        //console.log(app.routers[3].connected_routers_list);
    };
    /*
    *   generate a link state packet
    */
    router.prototype.generateLSP = function () {
        this.sequence = this.sequence + 1;
        this.ori_packet = new LSP();
        this.ori_packet.router_id = this.id;
        this.ori_packet.sequence = this.sequence;
        this.ori_packet.list = {};
        this.ori_packet.TTL = 10;
        for (var prop in this.connected_routers_list) {
            this.ori_packet.list[prop] = {};
            this.ori_packet.list[prop].cost = this.connected_routers_list[prop];
            this.ori_packet.list[prop].network = app.routers[prop].network;
        }
    };
    /*
    * update connected_routers_list by checking ticks
    */
    router.prototype.checkTicks = function () {
        for (var prop in this.connected_routers_list) {
            //update when shutdown
            if (this.recieved_list[this.tick][prop] == undefined && this.recieved_list[this.tick - 1][prop] == undefined) {
                this.setCostInfinite(prop);
            }
            //update when a router from shut-down to start
            if (this.recieved_list[this.tick][prop] != undefined) {
                this.connected_routers_list[prop] = 1;
                if (this.connected_routers_list[prop] == Number.MAX_VALUE) {
                    this.connected_routers_list[prop] = app.routers[prop].connected_routers_list[this.id];
                }
            }
        }
    };
    router.prototype.setCostInfinite = function (router_id) {
        this.connected_routers_list[router_id] = Number.MAX_VALUE;
    };
    router.prototype.checkDiscard = function (packet) {
        if (packet.TTL <= 0) {
            return true;
        }
        if (this.ohsr_list[packet.router_id] == null) {
            this.ohsr_list[packet.router_id] = packet.sequence;
        }
        else {
            if (this.ohsr_list[packet.router_id] >= packet.sequence) {
                return true;
            }
        }
        return false;
    };
    /*
    * construct a graph for all nodes base on new lsp
    */
    router.prototype.piecePuzzleTogether = function (packet) {
        for (var i in packet.list) {
            if (this.adjacent_list[packet.router_id] == null) {
                this.adjacent_list[packet.router_id] = {};
            }
            if (this.adjacent_list[i] == null) {
                this.adjacent_list[i] = {};
            }
            this.adjacent_list[packet.router_id][i] = packet.list[i].cost;
            this.adjacent_list[i][packet.router_id] = packet.list[i].cost;
            this.router_network_mapping[i] = packet.list[i].network;
        }
    };
    /*
    * update routing table(network, cost, outgoing link)
    */
    router.prototype.updateRoutingTable = function () {
        for (var i in SPF.D) {
            if (this.routing_table[app.routers[i].network] == undefined) {
                this.routing_table[app.routers[i].network] = {};
            }
            if (typeof SPF.D[i] != "number") {
                SPF.D[i] = parseInt(SPF.D[i]);
            }
            if (typeof app.routers[i].network_cost != "number") {
                app.routers[i].network_cost = parseInt(app.routers[i].network_cost);
            }
            this.routing_table[this.network] = {};
            this.routing_table[app.routers[i].network].cost = SPF.D[i] + app.routers[i].network_cost;
            this.routing_table[app.routers[i].network].outgoing_link = SPF.outgoing_link[i][1];
            if (typeof this.network_cost == "number") {
                this.routing_table[this.network].cost = this.network_cost;
            }
            else {
                this.routing_table[this.network].cost = parseInt(this.network_cost);
            }
            this.routing_table[this.network].outgoing_link = null;
        }
    };
    router.prototype.copyPacket = function (packet) {
        var new_packet = new LSP();
        for (var i in packet) {
            new_packet[i] = packet[i];
        }
        return new_packet;
    };
    return router;
}());
exports.router = router;
var LSP = /** @class */ (function () {
    function LSP() {
        this.id = uuidV4();
        this.router_id = null;
        this.sequence = null;
        this.TTL = 10;
        this.list = null;
        this.send_from = null;
    }
    return LSP;
}());
exports.LSP = LSP;
/*
* shortest path first algorithm (thanks to Dijkstra)
*/
var SPF = /** @class */ (function () {
    function SPF() {
    }
    SPF.init = function (s, adjacent_list) {
        //console.log(s,adjacent_list);
        this.s = s;
        this.adjacent_list = adjacent_list;
        this.S = {};
        this.VS = {};
        this.D = {};
        this.outgoing_link = {};
        for (var i in this.adjacent_list) {
            if (i == s) {
                this.S[i] = 1;
            }
            else {
                this.VS[i] = 1;
                if (this.adjacent_list[s] != undefined) {
                    if (this.adjacent_list[s][i] == undefined) {
                        this.D[i] = Number.MAX_VALUE;
                    }
                    else {
                        if (typeof this.adjacent_list[s][i] == "number") {
                            this.D[i] = this.adjacent_list[s][i];
                        }
                        else {
                            this.D[i] = parseInt(this.adjacent_list[s][i]);
                        }
                    }
                    this.outgoing_link[i] = [s, i];
                }
            }
        }
        //console.log(this.s,this.D);
    };
    SPF.computeSPF = function () {
        if (Object.getOwnPropertyNames(this.D).length != 0) {
            while (Object.getOwnPropertyNames(this.VS).length != 0) {
                var v = this.selectMinDFromVS();
                delete this.VS[v];
                this.S[v] = 1;
                for (var w in this.VS) {
                    var cost_v_w;
                    if (this.adjacent_list[v] == undefined) {
                        cost_v_w = Number.MAX_VALUE;
                    }
                    else {
                        if (this.adjacent_list[v][w] == undefined) {
                            cost_v_w = Number.MAX_VALUE;
                        }
                        else {
                            if (typeof this.adjacent_list[v][w] == "number") {
                                cost_v_w = this.adjacent_list[v][w];
                            }
                            else {
                                cost_v_w = parseInt(this.adjacent_list[v][w]);
                            }
                        }
                    }
                    if (typeof this.D[w] != "number") {
                        this.D[w] = parseInt(this.D[w]);
                    }
                    if (typeof this.D[v] != "number") {
                        this.D[v] = parseInt(this.D[v]);
                    }
                    if (this.D[v] + cost_v_w < this.D[w]) {
                        //console.log("change:",w,this.outgoing_link[w],this.outgoing_link[v],this.D[v],cost_v_w,this.D[w]);
                        this.outgoing_link[w] = [];
                        for (var j = 0; j < this.outgoing_link[v].length; j++) {
                            this.outgoing_link[w].push(this.outgoing_link[v][j]);
                        }
                        this.outgoing_link[w].push(w);
                    }
                    this.D[w] = Math.min(this.D[w], this.D[v] + cost_v_w);
                }
            }
        }
        //console.log(this.s,this.D);
        //console.log(this.s,this.outgoing_link);
    };
    /*
    *   select a node v in V-S such that D[v] is a minimum;
    */
    SPF.selectMinDFromVS = function () {
        var minVex = null;
        for (var i in this.VS) {
            if (minVex == null) {
                minVex = i;
            }
            else {
                if (typeof this.D[i] != "number") {
                    this.D[i] = parseInt(this.D[i]);
                }
                if (typeof this.D[minVex] != "number") {
                    this.D[minVex] = parseInt(this.D[minVex]);
                }
                if (this.D[i] < this.D[minVex]) {
                    minVex = i;
                }
            }
        }
        return minVex;
    };
    SPF.adjacent_list = {};
    SPF.S = {}; //a set S of selected nodes whose shortest distance from the source is already known
    SPF.VS = {};
    SPF.D = {};
    SPF.outgoing_link = {};
    return SPF;
}());
exports.SPF = SPF;
app.main();
