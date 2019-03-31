'use strict';

const EventEmitter = require('events')
const noble = require('noble')

class BLEDevice extends EventEmitter {
  constructor(options){
    super()
    options = options || {}
    this.state = 'disconnected';
    this.autoReconnect = true
    this.device = options.device || undefined
    this.address = options.address || undefined
    this.txCharUuid = '00000000-872a-4d03-afaf-7f5368899157'
    this.rxCharUuid = '00000000-1c41-42d0-bc79-df8168b55f04'

    this.characteristic = {
      rx: undefined,
      tx: undefined
    }

    noble.on('discover', this.handleDeviceDiscovery.bind(this))
    noble.on('stateChange', this.handleBleStateChange.bind(this))
  }

  setState(newState){
    this.state = newState
    this.emit(newState, this);
  }

  handleBleStateChange(state){
    console.log('state changed: '+state)

    if(!this.device && state == 'poweredOn'){
      noble.startScanning()
      this.state = 'connecting'
    }
    else if(state != 'poweredOn' && this.device){
      this.device = undefined
      this.characteristic.rx = undefined
      this.characteristic.tx = undefined
      this.setState('disconnected')
    }
  }

  disconnect(){
    if(noble.state != 'poweredOn'){return}
    let p = new Promise((resolve, reject)=>{
      console.log('disconnecting from device')
      this.device.disconnect((err)=>{
        this.device = undefined
        this.characteristic.rx = undefined
        this.characteristic.tx = undefined
        if(err){return reject(err)}
        this.setState('disconnected')
        resolve()
      })
    })
    return p
  }

  connect(){
    var p = new Promise((resolve, reject)=>{
      console.log('connecting to device')
      if(noble.state == 'poweredOn' && this.state == 'disconnected'){
        noble.startScanning();
        this.once('connected', (dev)=>{
          resolve(dev)
        })
      }
      else{
        console.warn(`noble not in desired state [${noble.state}]`)
        reject(`noble not in desired state [${noble.state}]`)
      }
    })
    return p
  }

  handleDeviceDiscovery(device){
    console.log('device discovered: ' + device.address)
    console.log(device.advertisment)
    if(device.advertisement && device.advertisement.localName && device.advertisement.localName.includes('RosHub')){
      console.log('found roshub device: ' + device.address)
      noble.stopScanning();

      device.connect((err)=>{
        console.log(`connected - err: ${err}`)

        device.discoverAllServicesAndCharacteristics((err, srvs, chars)=>{
          console.log(err)
          /*console.log(srvs)
          console.log(chars)*/

          this.device = device
          this.characteristic.rx = chars[0]
          this.characteristic.tx = chars[1]

          this.characteristic.rx.on('data', this.handleData.bind(this))
          this.characteristic.rx.subscribe((err)=>{
            console.log(`subscribe error: ${err}`)
          })

          this.setState('connected')
        })
      })
    }
  }

  transmit(data){
    let p = new Promise((resolve, reject)=>{
      if(!this.device){
        console.warn('not connected')
        if(this.autoReconnect){

          if(this.state == 'disconnected'){
            console.log('connecting device then sending...')
            resolve(this.connect().then(()=>{
              console.log('connected, now sending..')
              this.transmit(data)
            }))
          }
          else{
            console.log('waiting for device connection...')
            this.once('connected', ()=>{
              resolve(this.transmit(data))
            })
          }
        }else{
          console.warn('no device connection yet')
          reject('no device connection yet')
        }
      }
      else{
        console.log('writing data')
        //try{
          this.characteristic.tx.write(data, false, (err)=>{
            console.log('write complete')
            if(err){reject(err); return }
            resolve()
          })
        /*}
        catch(exception){
          reject(exception)
        }*/
      }
    })

    return p
  }

  handleData(data, isNotification){
    console.log(`tx value(${isNotification}): ${new Uint8Array(data)}`)
    this.emit('data', data, isNotification)
  }
}

module.exports = BLEDevice
