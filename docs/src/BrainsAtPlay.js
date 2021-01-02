
class BrainsAtPlay {
    constructor() {
        this.brains = new Map();
        this.userVoltageBuffers = []
        this.focusBuffer = []
        this.initialize()
    }

    initialize() {
        this.bufferSize = 1000;
        this.eegChannelCoordinates = this.getEEGCoordinates()
        this.usedChannels = []
        this.usedChannelNames = []
        this.connection;

        this.me = {
            username: undefined, // done
            index: undefined, // done
        };

        this.info = {
            interfaces: 0, // done
            brains: 0, // done
            public: true, // done
        }

        this.simulation = {
            generate: false,
            baseFrequency: 1,
            sampleRate: 125,
            generatedSamples: Math.round(125*(1/(1)))-1
        }

        this.synchrony = {
            value: 0,
            channels: [],
            buffer: new Array(this.bufferSize).fill(0)
        }

        this.updateArray = [];
        this.setUpdateMessage()
        this.initializeBuffer('focusBuffer')
        this.initializeBuffer('userVoltageBuffers')
    }

    reset(){
        this.initialize()
    }

    setUpdateMessage(obj){
        if (obj == undefined){
            this.updateArray = [{destination:[]}];
        } else {
            if (this.updateArray[0].destination === undefined || this.updateArray[0].destination.length == 0) {
                this.updateArray = [obj]
            } else {
                this.updateArray.push(obj)

            }
        }
    }


    getMyIndex(){
        let user = 0;
        let gotMe = false;

        this.brains.forEach((_,key) => {
            if (key == this.me.username || key == 'me'){
                this.me.index = user;
                gotMe = true;
            }
            user++
        })

        if (!gotMe){
            this.me.index = undefined;
        }
    }

    simulate(count){
        this.brains.clear()
        this.add('me')
        for (let i = 1; i < count; i++){
            this.add('other'+i);
        }
        this.info.brains = count;
        this.getMyIndex()
        this.updateUsedChannels()
        this.initializeBuffer('focusBuffer')
        this.initializeBuffer('userVoltageBuffers')
        this.me.username = "me"
        this.simulation.generate = true;
    }

    add(id,channelNames) {
        let brain;
        if (channelNames == undefined){
            brain = new Brain(id)
        } else {
            brain = new Brain(id,channelNames)
        }
        this.brains.set(id, brain)
        this.getMyIndex()
        this.updateUsedChannels()
        this.initializeBuffer('focusBuffer')
        this.initializeBuffer('userVoltageBuffers')
    }

    remove(id){
        this.brains.delete(id)
        this.initializeBuffer('focusBuffer')
        this.initializeBuffer('userVoltageBuffers')
    }


    stdDev(dataOfInterest){
        // Average Data
        let avg = dataOfInterest.reduce((a, b) => a + b, 0) / dataOfInterest.length;

        // Standard Deviation of Data
        let sqD = dataOfInterest.map(val => {
            var diff = val - avg;
            return diff * diff;
        })
        var aSqD = sqD.reduce((a, b) => a + b, 0) / sqD.length;
        var stdDev = Math.sqrt(aSqD);
        let relData = new Array(this.usedChannels.length).fill(0)
        let dev;

        this.usedChannels.forEach((channelInfo,ind) => {
            dev = (dataOfInterest[ind] - avg)/stdDev;
            if (isNaN(dev)){
                relData[channelInfo.index] = 0;
            } else {
                relData[channelInfo.index] = dev;
            }
        })
        return relData
    }

    getPower(relative=false){
        let dataOfInterest = [];
        let power = new Array(this.usedChannels.length).fill(0);
        let channelInd;
        if (this.me.index != undefined){
            this.usedChannels.forEach((channelInfo) => {
                channelInd = this.usedChannelNames.indexOf(channelInfo.name)
                // Calculate Average Power of Voltage Signal
                let data = this.userVoltageBuffers[this.me.index][channelInd]
                power[channelInd] = data.reduce((acc,cur) => acc + ((cur*cur)/2), 0)/data.length
                dataOfInterest.push(power[channelInd])
            })

            if (relative){
                power = this.stdDev(dataOfInterest)
            }

        }
        return power
    }

    getBandPower(band, relative=false){
        let dataOfInterest = [];
        let bandpower = new Array(this.usedChannels.length).fill(0);
        let channelInd;


        this.usedChannels.forEach((channelInfo) => {
            channelInd = this.usedChannelNames.indexOf(channelInfo.name)
            // NOTE: Not actually the correct samplerate
            bandpower[channelInd] = bci.bandpower(this.userVoltageBuffers[this.me.index][channelInd], this.simulation.sampleRate, band, {relative: false});
            dataOfInterest.push(bandpower[channelInd])
        })

        if (relative){
            bandpower = this.stdDev(dataOfInterest)
        }

        return bandpower
    }


    getSynchrony(method="pcc") {

        let channelSynchrony = [];

        this.synchrony.buffer.shift()
        if (this.brains.size > 1){
            // Generate edge array
            let edgesArray = [];

            for (let i = 0; i < this.brains.size; i++){
                if (i != this.me.index){
                    edgesArray.push([this.me.index,i])
                }
            }

            if (method == 'pcc') {
                // Source: http://stevegardner.net/2012/06/11/javascript-code-to-calculate-the-pearson-correlation-coefficient/

                edgesArray.forEach((edge) => {

                    let xC = this.userVoltageBuffers[edge[0]]
                    let yC = this.userVoltageBuffers[edge[1]]
                    let numChannels = Math.min(xC.length,yC.length)

                    for (let channel = 0; channel < numChannels; channel++){

                        let x = xC[channel]
                        let y = yC[channel]

                        var shortestArrayLength = 0;

                        if (x.length == y.length) {
                            shortestArrayLength = x.length;
                        } else if (x.length > y.length) {
                            shortestArrayLength = y.length;
                            // console.error('x has more items in it, the last ' + (x.length - shortestArrayLength) + ' item(s) will be ignored');
                        } else {
                            shortestArrayLength = x.length;
                            // console.error('y has more items in it, the last ' + (y.length - shortestArrayLength) + ' item(s) will be ignored');
                        }

                        var xy = [];
                        var x2 = [];
                        var y2 = [];

                        for (var i = 0; i < shortestArrayLength; i++) {
                            xy.push(x[i] * y[i]);
                            x2.push(x[i] * x[i]);
                            y2.push(y[i] * y[i]);
                        }

                        var sum_x = 0;
                        var sum_y = 0;
                        var sum_xy = 0;
                        var sum_x2 = 0;
                        var sum_y2 = 0;

                        for (var i = 0; i < shortestArrayLength; i++) {
                            sum_x += x[i];
                            sum_y += y[i];
                            sum_xy += xy[i];
                            sum_x2 += x2[i];
                            sum_y2 += y2[i];
                        }

                        var step1 = (shortestArrayLength * sum_xy) - (sum_x * sum_y);
                        var step2 = (shortestArrayLength * sum_x2) - (sum_x * sum_x);
                        var step3 = (shortestArrayLength * sum_y2) - (sum_y * sum_y);
                        var step4 = Math.sqrt(step2 * step3);
                        var answer = step1 / step4;

                        if (channel >= channelSynchrony.length){
                            channelSynchrony.push([answer])
                        } else {
                            channelSynchrony[channel].push(answer)
                        }
                    }
                })

                this.synchrony.channels = channelSynchrony.map((channelData) => {return channelData.reduce((a, b) => a + b, 0) / channelData.length})
            } else {
                this.synchrony.channels = new Array(this.usedChannels.length).fill(0)
            }

            // Average Within Channels
            let avg = this.synchrony.channels.reduce((a, b) => a + b, 0) / this.synchrony.channels.length;
            if (!isNaN(avg)) {
                this.synchrony.buffer.push(avg)
            } else {
                this.synchrony.buffer.push(0)
            }
        } else {
            this.synchrony.channels = new Array(this.usedChannels.length).fill(0);
            this.synchrony.buffer.push(0)
        }

        // Average Across Channels
        this.synchrony.value = this.synchrony.buffer.reduce((a, b) => a + b, 0) / this.synchrony.buffer.length;
    }

    initializeBuffer(buffer=undefined) {

        let b = [];
        let user;
        let users;
        if (buffer == 'focusBuffer'){
            users = 1;
        } else {
            users = this.brains.size;
        }

        // let perUser = Math.floor(pointCount/(users*this.usedChannels.length));

        for(user=0; user < users; user++){
            b.push([])
            for(let chan=0; chan < this.usedChannels.length; chan++){
                b[user].push(new Array(this.bufferSize).fill(0.0));
            }
        }

        // let remainder = pointCount - this.usedChannels.length*users*perUser
        //     for (let chan = 0; chan < this.usedChannels.length; chan++) {
        //         for (user = 0; user < users; user++)
        //             if (remainder > 0) {
        //                 remainder--;
        //                 b[user][chan].push(0.0)
        //             }
        //     }

        if (buffer != undefined){
            this[buffer] = b;
        }
    }

    generateVoltageStream(){

        this.brains.forEach((user) => {
            let signal = new Array(this.usedChannels.length);
            for (let channel =0; channel < this.usedChannels.length; channel++) {
                signal[channel] = bci.generateSignal([Math.random()], [this.simulation.baseFrequency+Math.random()*40], this.simulation.sampleRate, (1/this.simulation.baseFrequency));
            }

            let startTime = Date.now()
            let time = [];
            let cardinality = (1/this.simulation.baseFrequency)*this.simulation.sampleRate;
            let step = (1/this.simulation.baseFrequency) / (cardinality - 1);
            for (let i = 0; i < cardinality; i++) {
                time.push(startTime + (step * i));
            }

            let data = {
                signal: signal,
                time: time
            }
            user.streamIntoBuffer(data)
        })
    }


    update(metrics = []) {
        // Generate signal if specified
        if (this.simulation.generate) {
            if (this.simulation.generatedSamples == Math.round(this.simulation.sampleRate*(1/this.simulation.baseFrequency))-1){
                this.generateVoltageStream()
                this.simulation.generatedSamples = 0;
            } else {
                this.simulation.generatedSamples += 1
            }
        }
        this.setUpdateMessage()
        this.updateBuffer('brains','userVoltageBuffers')

        if (metrics.includes('synchrony')) {
            this.getSynchrony('pcc')
        }
    }

    updateBuffer(source='brains',buffer='userVoltageBuffers'){
        let channelInd;
        let userInd = 0;
        this.brains.forEach((brain) => {
            brain.buffer.forEach((channelData, channel) => {
                channelInd = this.usedChannelNames.indexOf(brain.channelNames[channel])
                if (source == 'brains'){
                    if (channelData.length != 0){
                        channelData = brain.buffer[channel].shift()
                    } else {
                        channelData = 0
                    }
                } else {
                    channelData = source[channel]
                }
                if (source == 'brains'){
                    this[buffer][userInd][channelInd].splice(0,1)
                    this[buffer][userInd][channelInd].push(channelData)
                } else {
                    if (userInd == 0) {
                        if (this.me.index != undefined){
                            this[buffer][this.me.index][channelInd].splice(0,1)
                            this[buffer][this.me.index][channelInd].push(channelData)
                        } else {
                            this[buffer][0][channelInd].splice(0,1)
                            this[buffer][0][channelInd].push(channelData)
                        }
                    }
                }
            })
            userInd++
        })
    }

    flatten(buffer='userVoltageBuffers', normalize=false){
        let _temp = this[buffer];
        if (normalize){
            _temp = this.normalizeUserBuffers(this[buffer]);
        }
        // Upsample Buffer
        return new Float32Array([..._temp.flat(2)])
    }

    normalizeUserBuffers(buffer) {
        let _temp = buffer.map((userData) => {
            return userData.map((channelData) => {
                let max = Math.max(...channelData)
                let min = Math.min(...channelData)
                let scaling = (window.innerHeight/6)/this.usedChannels.length;
                if (min != max){
                    return channelData.map((val) => {
                        var delta = max - min;
                        return scaling * (2*((val - min) / delta) - 1)
                    })
                } else{
                    return channelData.map((val) => {return val*scaling})
                }

            })
        })
        return _temp
    }

    updateUsedChannels() {
        this.usedChannels = [];
        this.usedChannelNames = [];

        // Define all used channel indices
        Object.keys(this.eegChannelCoordinates).forEach((name,ind) => {
            // Extract All Used EEG Channels
            this.brains.forEach((user) => {
                if (user.channelNames.includes(name) && this.usedChannelNames.indexOf(name) == -1){
                    this.usedChannels.push({name:name, index:ind})
                    this.usedChannelNames.push(name)
                }
            })
        })
    }

    // Networking Suite

    disconnect(){
        this.connection.close();
    }

    connect(gameName){

        if (this.connection) {
            this.connection.onerror = this.connection.onopen = this.connection.onclose = null;
            this.connection.close();
        }

        if (this.url.protocol == 'http:'){
            this.connection = new WebSocket(`ws://` + this.url.hostname,[this.me.username, 'interfaces', gameName]);
        } else if (this.url.protocol == 'https:'){
            this.connection = new WebSocket(`wss://` + this.url.hostname,[this.me.username, 'interfaces', gameName]);
        } else{
            console.log('invalid protocol')
            return
        }

        this.connection.onerror =  () => {
            this.setUpdateMessage({destination:'error'})
        };

        this.connection.onopen =  () => {
            this.initialize()
            this.connection.send(JSON.stringify({'destination':'initializeBrains','public': BrainsAtPlay.public}));
            this.setUpdateMessage({destination:'opened'})
        };

        this.connection.onmessage =  (msg) => {

            let obj = JSON.parse(msg.data);
            if (obj.destination == 'bci'){
                if (this.brains.get(obj.id) != undefined){
                    this.brains.get(obj.id).streamIntoBuffer(obj.data)
                }
            } else if (obj.destination == 'init'){

                this.brains.clear()

                if (obj.privateBrains && this.info.public === false){
                    this.add(obj.privateInfo.id, obj.privateInfo.channelNames)
                } else {
                    for (let newUser = 0; newUser < obj.nBrains; newUser++){
                        if (this.brains.get(obj.ids[newUser]) == undefined && obj.ids[newUser] != undefined){
                            if (this.info.public){
                                this.add(obj.ids[newUser], obj.channelNames[newUser])
                            } else {
                                if (obj.ids[newUser] == this.me.username){
                                    this.add(obj.ids[newUser], obj.channelNames[newUser])
                                }
                            }
                        }
                    }
                }

                if (this.brains.size == 0){
                    this.add('me');
                    this.info.brains = 1;
                }

                this.simulation.generate = false;
                this.updateUsedChannels()
                this.initializeBuffer('userVoltageBuffers')
                this.info.interfaces = obj.nInterfaces;
                this.getMyIndex()
                this.setUpdateMessage(obj)
            }

            else if (obj.destination == 'brains'){
                let update = obj.n;

                this.info.brains += update;

                // Only update if access matches
                if ((this.info.public) || (!this.info.public && obj.access === 'private')){
                    if (update == 1){
                        if (this.info.public){
                            this.add(obj.id, obj.channelNames)
                            this.remove('me')
                        } else if (!this.info.public && obj.access === 'private') {
                            this.add(obj.id, obj.channelNames)
                            this.remove('me')
                        }
                    } else if (update == -1){
                        this.remove(obj.id)
                        if (this.info.public){
                            if (this.brains.size == 0){
                                this.add('me')
                            }
                        } else if (!this.info.public && obj.access === 'private'){
                            this.add('me')
                        }
                    }
                    this.initializeBuffer('userVoltageBuffers')
                    this.updateUsedChannels()
                }

                this.getMyIndex()
                this.setUpdateMessage(obj)
            }
            else if (obj.destination == 'interfaces'){
                this.info.interfaces += obj.n;
                this.setUpdateMessage(obj)
            }
            else {
                console.log(obj)
            }
        };

        this.connection.onclose =  () => {
            this.connection = undefined;
            this.info.interfaces = undefined;
            this.simulate(2)
            this.simulation.generate = true;
            this.getMyIndex()
            this.setUpdateMessage({destination: 'closed'})
        };
    }


    // Requests
    login(dict, url='https://brainsatplay.azurewebsites.net/') {
        this.url = new URL(url);

        const handleLoginRequest = async (dict) => {
            let json  = JSON.stringify(dict)

            let resDict = await fetch(url + 'login',
                { method: 'POST',
                    mode: 'cors',
                    headers: new Headers({
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }),
                    body: json
                }).then((res) => {return res.json().then((message) => message)})
                .then((message) => {
                    return message})
                .catch(function (err) {
                    console.log(`\n${err.message}`);
                });

            if (resDict.result == 'OK'){
                this.me.username = resDict.msg;
            }
            return resDict
        }
        return handleLoginRequest(dict)
    }

    signup(dict, url='https://brainsatplay.azurewebsites.net/') {
        this.url = new URL(url);

        const handleSignupRequest = async (dict) => {
            let json  = JSON.stringify(dict)

            let resDict = await fetch(url + 'signup',
                { method: 'POST',
                    mode: 'cors',
                    headers: new Headers({
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }),
                    body: json
                }).then((res) => {return res.json().then((message) => message)})
                .then((message) => {
                    console.log(`\n${message}`);
                    return message})
                .catch(function (err) {
                    console.log(`\n${err.message}`);
                });

            return resDict
        }
        return handleSignupRequest(dict)
    }


    // Included Data
    getEEGCoordinates(){
        return {
            Fp1: [-21.2, 66.9, 12.1],
            Fpz: [1.4, 65.1, 11.3],
            Fp2: [24.3, 66.3, 12.5],
            Af7: [-41.7, 52.8, 11.3],
            Af3: [-32.7, 48.4, 32.8],
            Afz: [1.8, 54.8, 37.9],
            Af4: [35.1, 50.1, 31.1],
            Af8: [43.9, 52.7, 9.3],
            F7: [-52.1, 28.6, 3.8],
            F5: [-51.4, 26.7, 24.7],
            F3: [-39.7, 25.3, 44.7],
            F1: [-22.1, 26.8, 54.9],
            Fz: [0.0, 26.8, 60.6],
            F2: [23.6, 28.2, 55.6],
            F4: [41.9, 27.5, 43.9],
            F6: [52.9, 28.7, 25.2],
            F8: [53.2, 28.4, 3.1],
            Ft9: [-53.8, -2.1, -29.1],
            Ft7: [-59.2, 3.4, -2.1],
            Fc5: [-59.1, 3.0, 26.1],
            Fc3: [-45.5, 2.4, 51.3],
            Fc1: [-24.7, 0.3, 66.4],
            Fcz: [1.0, 1.0, 72.8],
            Fc2: [26.1, 3.2, 66.0],
            Fc4: [47.5, 4.6, 49.7,],
            Fc6: [60.5, 4.9, 25.5],
            Ft8: [60.2, 4.7, -2.8],
            Ft10: [55.0, -3.6, -31.0],
            T7: [-65.8, -17.8, -2.9],
            C5: [-63.6, -18.9, 25.8],
            C3: [-49.1, -20.7, 53.2],
            C1: [-25.1, -22.5, 70.1],
            Cz: [0.8, -21.9, 77.4],
            C2: [26.7, -20.9, 69.5],
            C4: [50.3, -18.8, 53.0],
            C6: [65.2, -18.0, 26.4],
            T8: [67.4, -18.5, -3.4],
            Tp7: [-63.6, -44.7, -4.0],
            Cp5: [-61.8, -46.2, 22.5],
            Cp3: [-46.9, -47.7, 49.7],
            Cp1: [-24.0, -49.1, 66.1],
            Cpz: [0.7, -47.9, 72.6],
            Cp2: [25.8 ,-47.1, 66.0],
            Cp4: [49.5, -45.5, 50.7],
            Cp6: [62.9, -44.6, 24.4],
            Tp8: [64.6, -45.4, -3.7],
            P9: [-50.8, -51.3, -37.7],
            P7: [-55.9, -64.8, 0.0],
            P5: [-52.7, -67.1, 19.9],
            P3: [-41.4, -67.8, 42.4],
            P1: [-21.6, -71.3, 52.6],
            Pz: [0.7, -69.3, 56.9],
            P2: [24.4, -69.9, 53.5],
            P4: [44.2, -65.8, 42.7],
            P6: [54.4, -65.3, 20.2],
            P8: [56.4, -64.4, 0.1],
            P10: [51.0, -53.9, -36.5],
            PO7: [-44.0, -81.7, 1.6],
            PO3: [-33.3, -84.3, 26.5],
            POz: [0.0, -87.9, 33.5],
            PO4: [35.2, -82.6, 26.1],
            PO8: [43.3, -82.0, 0.7],
            O1: [-25.8, -93.3, 7.7],
            Oz: [0.3, -97.1, 8.7],
            O2: [25.0,-95.2,6.2],
        }
    }
}


class Brain {
    constructor(userId, channelNames = 'Fz,C3,Cz,C4,Pz,PO7,Oz,PO8,F5,F7,F3,F1,F2,F4,F6,F8') {
        this.id = userId;
        this.channelNames = channelNames.split(',')
        this.numChannels = this.channelNames.length;
        this.buffer = [[]];
        this.times = [];
        this.bufferTime = 10000; // 10 seconds
        this.bufferSize = 1000

    }

    streamIntoBuffer(data) {

        let signal = data.signal
        let time = data.time

        signal.forEach((channelData,channel) =>{

            if (channel >= this.buffer.length){
                this.buffer.push([])
            }

            if (Array.isArray(channelData) && channelData.length) {
                if (channelData.length > 0) {
                    this.buffer[channel].push(...channelData);
                    this.times.push(...time);
                }
            }
        })

        this.trimBufferBySize()
    }


    trimBufferByTime(){
        let indexes = this.times.map((elm, idx) => (Date.now()-elm) >= this.bufferTime ? idx : '').filter(String);
        indexes.sort(function(a,b){ return b - a; });
        this.buffer.forEach((_,channel) =>{
            for (var i = indexes.length -1; i >= 0; i--){
                this.buffer[channel].splice(indexes[i],1);
                this.times.splice(indexes[i],1);
            }
        })
    }

    trimBufferBySize() {
        this.buffer.forEach((_,channel) =>{
            let length = this.buffer[channel].length
            if (length-this.bufferSize > 0){
                this.buffer[channel].splice(this.bufferSize,length);
                this.times.splice(this.bufferSize,length);
            }
        })
    }
}