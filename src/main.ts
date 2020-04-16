import levelup from 'levelup'
import leveldown from 'leveldown'
import sublevel from 'subleveldown'
import lexint from 'lexicographic-integer-encoding'
import Web3 from 'web3'
import net from 'net'
import multihashes from 'multihashes'
import bs58 from 'bs58'
import http from 'http'
import { brotliDecompressSync } from 'zlib'
import ItemProto from './Item_pb.js'
import FileMixinProto from './FileMixin_pb.js'
import ImageMixinProto from './ImageMixin_pb.js'
import VideoMixinProto from './VideoMixin_pb.js'
import { Mutex, MutexInterface } from 'async-mutex'

let web3
let db
let dbEviction
let ipfsInterval
let mutex: MutexInterface = new Mutex()
let pinVideoAccounts: string[]

let agent = new http.Agent({
  keepAlive: true,
})

function ipfsGet(command: string, json: boolean = true, exit: boolean = true): Promise<any> {
  return new Promise((resolve, reject) => {
    let options = {
      agent: agent,
      path: '/api/v0/' + command,
      port: process.env.IPFS_PORT!,
    }

    let req: any = http.get(options)
    .on('response', res => {
      let body = ''
      res.on('data', (data: any) => {
        body += data
      })
      res.on('end', () => {
        resolve(json ? JSON.parse(body) : body)
      })
    })
    .on('error', async (error: any) => {
      if (error.code == 'ECONNREFUSED' && exit) {
        console.error(error)
        process.exit(1)
      }
      if (error.code === 'ECONNRESET') {
        try {
          resolve(await ipfsGet(command, json))
        }
        catch (error) {
          reject(error)
        }
      }
      else {
        reject(error)
      }
    })
  })
}

function connect() {
	let bootnodes = [
		'/ip4/172.104.175.158/tcp/4001/ipfs/QmQ38hetbvfJwhDXvXxyxT8reydNwPq6n9eXzEB11cwsji',
		'/ip6/2400:8901::f03c:91ff:fe46:1815/tcp/4001/ipfs/QmQ38hetbvfJwhDXvXxyxT8reydNwPq6n9eXzEB11cwsji',
		'/ip4/74.207.240.177/tcp/4001/ipfs/QmTdLvqQxAexuJAbSv8MnD3gK5DcscL15WWA8sYUH4vMvi',
		'/ip6/2600:3c01::f03c:91ff:fed5:2abf/tcp/4001/ipfs/QmTdLvqQxAexuJAbSv8MnD3gK5DcscL15WWA8sYUH4vMvi',
		'/ip4/45.79.128.151/tcp/4001/ipfs/QmXZBgSuTxKGsYmx6N1G8EEUWAm1tRXGuYadfxhgWetJf2',
		'/ip6/2600:3c03::f03c:91ff:fed5:2a82/tcp/4001/ipfs/QmXZBgSuTxKGsYmx6N1G8EEUWAm1tRXGuYadfxhgWetJf2',
		'/ip4/139.162.224.203/tcp/4001/ipfs/QmS6XPQKZSinqwFCsth7LxJeeH66ZiAgYxPphPCoWTiefq',
		'/ip6/2a01:7e00::f03c:91ff:fed5:2a94/tcp/4001/ipfs/QmS6XPQKZSinqwFCsth7LxJeeH66ZiAgYxPphPCoWTiefq',
		'/ip4/172.104.130.233/tcp/4001/ipfs/Qmar9pZaQPaMisc1x1LstphJV1jJiPrv21Edig93bz6oh8',
		'/ip6/2a01:7e01::f03c:91ff:fed5:2a00/tcp/4001/ipfs/Qmar9pZaQPaMisc1x1LstphJV1jJiPrv21Edig93bz6oh8',
		'/ip4/172.104.68.7/tcp/4001/ipfs/QmPe3zVKqnwPyBDf51zg6XkKTLz2tx4iW3DtCtK6ojm6er',
		'/ip6/2400:8902::f03c:91ff:fed5:2ac0/tcp/4001/ipfs/QmPe3zVKqnwPyBDf51zg6XkKTLz2tx4iW3DtCtK6ojm6er',
	]

	bootnodes.forEach(async bootnode => {
		try {
			await ipfsGet('swarm/connect?arg=' + bootnode)
		} catch (e) {}
	})
}

function storeEvictionIpfsHash(ipfsHash: string) {
  return new Promise(async (resolve, reject) => {
    let release = await mutex.acquire()
    let id: number = 0
    dbEviction.createKeyStream({
      reverse: true,
      limit: 1,
    })
    .on('data', (key: number) => {
      id = key + 1
    })
    .on('end', async () => {
      await dbEviction.put(id, ipfsHash)
      release()
      resolve()
    })
  })
}

async function pinIpfsHash(ipfsHash: string, owner: string) {
	try {
		let encodedIpfsHash = multihashes.toB58String(multihashes.encode(Buffer.from(ipfsHash.substr(2), "hex"), 'sha2-256'))
		console.log(encodedIpfsHash)
		ipfsGet('pin/add?arg=' + encodedIpfsHash)
		let data = await ipfsGet('cat?arg=/ipfs/' + encodedIpfsHash, false)
		console.log(encodedIpfsHash, 'received')
		let itemPayload = brotliDecompressSync(Buffer.from(data, "binary"))
		let mixins = ItemProto.Item.deserializeBinary(itemPayload).getMixinPayloadList()
		for (let i = 0; i < mixins.length; i++) {
      let mixinId = '0x' + ('00000000' + mixins[i].getMixinId().toString(16)).slice(-8)

      switch (mixinId) {
        case '0x3c5bba9c':  // file
          let fileMessage = new FileMixinProto.FileMixin.deserializeBinary(mixins[i].getPayload())
  	      let encodedIpfsHash = bs58.encode(Buffer.from(fileMessage.getIpfsHash()))
  				console.log(encodedIpfsHash)
  				await ipfsGet('pin/add?arg=' + encodedIpfsHash)
  				console.log(encodedIpfsHash, 'received')
          break

        case '0x045eee8c':  // image
  				let imageMessage = new ImageMixinProto.ImageMixin.deserializeBinary(mixins[i].getPayload())
  				let mipmapList = imageMessage.getMipmapLevelList()
  				console.log('Image mipmaps:', mipmapList.length)

  				mipmapList.forEach(async mipmap => {
  					let encodedIpfsHash = bs58.encode(Buffer.from(mipmap.getIpfsHash()))
  					console.log(encodedIpfsHash)
  					await ipfsGet('pin/add?arg=' + encodedIpfsHash)
  					console.log(encodedIpfsHash, 'received')
  				})
          break

        case '0x51108feb':  // video
          if (pinVideoAccounts.includes(owner)) {
            let videoMessage = new VideoMixinProto.VideoMixin.deserializeBinary(mixins[i].getPayload())
            let encodingList = videoMessage.getEncodingList()
            console.log('Video encodings:', encodingList.length)

    				encodingList.forEach(async encoding => {
    					let encodedIpfsHash = bs58.encode(Buffer.from(encoding.getIpfsHash()))
    					console.log(encodedIpfsHash)
              await storeEvictionIpfsHash(encodedIpfsHash)
    					await ipfsGet('pin/add?arg=' + encodedIpfsHash)
    					console.log(encodedIpfsHash, 'received')
    				})
          }

          break
      }
    }
	} catch (e) {console.log(e)}
}

async function start() {
  db = levelup(leveldown('db'))
  dbEviction = sublevel(db, 'eviction', {
    keyEncoding: lexint('hex', {strict: true}),
    valueEncoding: 'ascii',
  })

  pinVideoAccounts = process.env.PIN_VIDEO_ACCOUNTS!.split(',')
  console.log('Pin video accounts:', pinVideoAccounts)

  console.log('Waiting for MIX IPC.')
  await new Promise((resolve, reject) => {
    let intervalId = setInterval(async () => {
      try {
        web3 = new Web3(new Web3.providers.IpcProvider(process.env.MIX_IPC_PATH!, net))
        await web3.eth.getProtocolVersion()
        clearInterval(intervalId)
        resolve()
      }
      catch (e) {}
    }, 1000)
  })

	let blockNumber = await web3.eth.getBlockNumber()
	console.log('Block:', blockNumber.toLocaleString())

  console.log('Waiting for IPFS RPC.')
  await new Promise((resolve, reject) => {
    let intervalId = setInterval(async () => {
      try {
        await ipfsGet('id', true, false)
        clearInterval(intervalId)
        resolve()
      }
      catch (e) {}
    }, 1000)
  })

  let fromBlock: number
  try {
    fromBlock = parseInt(await db.get('lastBlock')) - 5760  // ~1 day
  }
  catch (e) {
    fromBlock = 0
  }
  console.log('fromBlock:', fromBlock.toLocaleString())

	let itemStoreIpfsSha256 = new web3.eth.Contract(require('./MixItemStoreIpfsSha256.abi.json'),
  '0x26b10bb026700148962c4a948b08ae162d18c0af')
	itemStoreIpfsSha256.events.PublishRevision({
		fromBlock: fromBlock,
		toBlock: 'pending',
	})
	.on('data', async event => {
		let item = await itemStoreIpfsSha256.methods.getItem(event.returnValues.itemId).call()

		for (let ipfsHash of item.ipfsHashes) {
			pinIpfsHash(ipfsHash, item.owner)
		}

    db.put('lastBlock', event.blockNumber)
	})

	ipfsInterval = setInterval(connect, 30000)
}

start()
