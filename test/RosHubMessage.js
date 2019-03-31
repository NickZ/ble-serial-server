'use strict';

var RosHubMessageSequence = 0;

class RosHubMessage {
  constructor(options){
    this.data = (options.msg) ? new Buffer(JSON.stringify(options.msg)) : undefined
    this.packetCount = options.packetCount || ((options.msg) ? Math.ceil(this.data.length / 16) : undefined)
    this.commandSeq = options.commandSeq || RosHubMessageSequence++
    this.mtu = options.mtu || 20
    this.dataMap = {}
    this.rxComplete = false

    console.log(`new message with seq=${this.commandSeq}`)
    console.log(this.data)
    //console.log(this.data.length)
    console.log(this.packetCount)
    console.log(JSON.stringify(options.msg))
  }

  static fromPacket(packet){
    let seq = packet[0]
    let pktCount = packet[2]

    let message = new RosHubMessage({
      packetCount: pktCount,
      commandSeq: seq
    })

    message.parsePacket(packet)
    return message
  }

  parsePacket(packet){
    let seq = packet[0]
    let idx = packet[1]
    let pktCount = packet[2]
    let flags = (packet[3] >>  5) & 0xf
    let dataLen = packet[3] & 0x1f

    if(!this.packetCount){
      this.packetCount = pktCount
      this.commandSeq = seq
    }

    if(!this.data){
      this.data = new Array(this.packetCount * (this.mtu - 4))
    }

    let startOffset = idx * (this.mtu-4);
    let endOffset = (dataLen+startOffset)-1


    for(let i=0; i < dataLen; i++){
      this.data[startOffset+i] = packet[4+i]
    }
    this.dataMap[idx] = true

    let readAll = true;

    for(let p = 0; p<this.packetCount; p++){
      if(!this.dataMap[p]){
        readAll = false
        break
      }
    }

    if(idx == this.packetCount-1){
      //Account for last packet's length
      let actualEndOffset = this.data.length - ((this.mtu-4) - dataLen)
      this.data = this.data.slice(0, actualEndOffset)
      this.data = this.data.join('')
    }

    this.rxComplete = readAll
    return readAll
  }

  getPacket(idx){
    if(idx > -1 && idx < this.packetCount){

      //let packet = new Uint8Array(20)
      let packet = Buffer.alloc(20)
      packet.fill(0x0)

      let startOffset = idx * (this.mtu-4);
      let endOffset = Math.min((startOffset+(this.mtu-4)-1), this.data.length-1)
      let dataLen = (endOffset - startOffset)+1

      packet[0] = this.commandSeq
      packet[1] = idx
      packet[2] = this.packetCount
      packet[3] = dataLen & 0x1f

      if(dataLen > this.mtu - 4){ throw "Buffer bounds error data length="+dataLen }

      let buf = []

      for(let i = 0; i<dataLen; i++){
        let val = this.data[i+startOffset]
        packet[4+i] = val
        //buf.push(val)
        //console.log(val)
      }

      //console.log(buf)
      //packet.set(buf, 4)

      console.log(`packet - ${packet}` )

      return packet;
    }
  }
}

module.exports = RosHubMessage
