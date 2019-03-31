const BLEDevice = require('./BLEDevice.js')
const RosHubBLEClient = require('./RosHubBLEClient.js')

let dev = new BLEDevice()
let client = new RosHubBLEClient(dev)

dev.once('connected', ()=>{
  console.log('device is connected')
  let junk = ""
  for(let i=0; i<1024; i++){
    junk+='a'
  }
  client.sendCommand('identity', {'ch': '元旦周末'}).then((cmd)=>{
    console.log('got response')
    console.log(cmd)
  }).catch((err)=>{
    console.log('send error')
    console.log(err)

    setTimeout(()=>{
      console.log('testing wake up')
      client.sendCommand('identity').then(console.log).catch(console.log)
    }, 20000)
  })
})
