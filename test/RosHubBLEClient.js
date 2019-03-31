'use strict';

const EventEmitter = require('events')
const RosHubMessage = require('./RosHubMessage.js')

class RosHubBLEClient extends EventEmitter {
  constructor(device){
    super()
    this.timeoutMs = 5000
    this.timer = undefined
    this.device = device
    this.disconnectTimeoutMs = 10000
    this.disconnectTimer = undefined
    this.msgMap = {}
    this.cmdDurationMs = []
    this.ackRequired = false
    this.serviceUuid = 0x1101

    this.device.on('data', this.onData.bind(this))
  }

  /**
   *  Send a command to the BLE peripherial
   *
   *  @param  cmd
   *  @param  params
   *  @returns  Promise(command)
   */
  sendCommand(cmd, params){
    let msg = new RosHubMessage({msg:{cmd: cmd, params: params}})

    let rxP = new Promise((resolveRx, rejectRx)=>{
      let txP = new Promise((resolveTx, rejectTx)=>{
        let command = {
          startTime: Date.now(),
          endTime: undefined,
          lastActivity: Date.now(),
          request: msg,
          response: undefined,
          timeout: false
        }

        this.msgMap[msg.commandSeq] = command

        if(this.ackRequired){
          console.log('sending with ACKs required')
        }
        else{
          console.log('sending without ACKs')
          let packetIdx = 0
          let that = this
          function sendNextPacket(){
            if(command.timeout){
              console.log('timeout short circuit')
              rejectTx()
            }
            that.device.transmit(msg.getPacket(packetIdx)).then(()=>{
              if(packetIdx < (msg.packetCount-1)){
                packetIdx++
                console.log(`sending next packet ${packetIdx}`)
                sendNextPacket()
              }
              else{
                console.log(`done at index ${packetIdx}`)
                resolveTx(command)
              }
            })
          }

          sendNextPacket()
        }
      })

      this.once(`command-timeout-${msg.commandSeq}`, (command)=>{
        command.timeout = true
        rejectRx({timeout: true, cmd: command})
      })

      return txP.then(()=>{
        //transmit complete
        //listen for data and ack/nak if requested
        this.on(`rx-${msg.commandSeq}`, (data)=>{
          if(command.response.rxComplete){
            command.endTime = Date.now()

            let deltaMs = command.endTime - command.startTime
            console.log(`Finished command[${seq}] in ${deltaMs} ms`)
            this.cmdDurationMs.push(deltaMs)

            delete this.msgMap[msg.commandSeq]
            resolveRx(command)
            this.emit('command-finished', command)
          }
        })
      })
    })

    if(!this.timer){
      console.log('start rx timer')
      this.timer = setInterval(this.handleTimeouts.bind(this), this.timeoutMs)
    }

    if(this.disconnectTimer){
      console.log('stop activity timer')
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = undefined
    }

    this.msgMap[msg.commandSeq].rxPromise = rxP

    return rxP
  }

  onData(input, isNotification){
    let data = new Uint8Array(input)
    let seq = data[0]
    let pktIdx = data[1]
    let flags = (data[3] >> 5) & 0x7
    let flagObj = {
      ack: flags & (1<<2),
      nak: flags & (1<<1),
      req: flags & (1<<0)
    }

    let command = this.msgMap[seq]
    if(!command){
      console.warn(`Rejecting unexpected command response[${seq}]`)
      return
    }

    if(flagObj.ack && flagObj.req && !flagObj.nak){
      //Process request ACK
      console.log(`ack-${seq}-${pktIdx}`)
      this.emit(`ack-${seq}-${pktIdx}`, data)
    }
    else if(!flagObj.ack && flagObj.req && flagObj.nak){
      //Process request NAK
      console.log(`nak-${seq}-${pktIdx}`)
      this.emit(`nak-${seq}-${pktIdx}`, data)
    }
    else if(!flagObj.ack && !flagObj.req && !flagObj.nak){
      //Process incoming response
      console.log(`rx-${seq}`)
      if(command.response){ command.response.parsePacket(data) }
      else{ command.response = RosHubMessage.fromPacket(data) }

      command.lastActivity = Date.now()
      this.emit(`rx-${seq}`, data)
    }
    else{
      console.warn(`Ignoring unexpected packet flags ${JSON.stringify(flagObj)}`)
    }
  }

  handleTimeouts(){
    for(let seq in this.msgMap){
      let command = this.msgMap[seq]
      let now = Date.now()
      let limitMs = command.lastActivity + this.timeoutMs

      if(now > limitMs){
        console.log(`rejecting ${seq}..`)
        delete this.msgMap[seq]
        this.emit(`command-timeout-${seq}`, command)
        this.emit(`command-timeout`, command)
      }
    }

    if(Object.keys(this.msgMap).length < 1){
      console.log('stopping timeout')
      clearInterval(this.timer)
      this.timer = undefined
      this.disconnectTimer = setTimeout(this.handleDisconnectTimeout.bind(this), this.disconnectTimeoutMs)
    }
  }

  handleDisconnectTimeout(){
    if(Object.keys(this.msgMap).length < 1){
      console.log('disconnecting due to inactivity')
      this.device.disconnect()
    }

    this.disconnectTimer = undefined
  }
}

module.exports = RosHubBLEClient
