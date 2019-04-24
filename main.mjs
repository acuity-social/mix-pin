import Web3 from 'web3'
import net from 'net'
import ItemStoreIpfsSha256Abi from './ItemStoreIpfsSha256.abi.json'
import multihashes from 'multihashes'
import Base58 from 'base-58'
import axios from 'axios'
import brotli from 'iltorb'
import itemProto from './item_pb.js'
import jpegImageProto from './jpeg-image_pb.js'

let ipfsInterval

function connect() {
	let bootnodes = [
		'/ip4/172.104.175.158/tcp/4001/ipfs/QmQ38hetbvfJwhDXvXxyxT8reydNwPq6n9eXzEB11cwsji',
		'/ip6/2400:8901::f03c:91ff:fe46:1815/tcp/4001/ipfs/QmQ38hetbvfJwhDXvXxyxT8reydNwPq6n9eXzEB11cwsji',
		'/ip4/74.207.240.177/tcp/4001/ipfs/QmTdLvqQxAexuJAbSv8MnD3gK5DcscL15WWA8sYUH4vMvi',
		'/ip6/2600:3c01::f03c:91ff:fed5:2abf/tcp/4001/ipfs/QmTdLvqQxAexuJAbSv8MnD3gK5DcscL15WWA8sYUH4vMvi',
		'/ip4/173.255.195.214/tcp/4001/ipfs/QmZDy4rjTwvkkv4CRre87Z4ohr5JfMMSNwhbdcX21szCnn',
		'/ip6/2600:3c00::f03c:91ff:fed5:2aa3/tcp/4001/ipfs/QmZDy4rjTwvkkv4CRre87Z4ohr5JfMMSNwhbdcX21szCnn',
		'/ip4/50.116.38.52/tcp/4001/ipfs/QmcR25jursru6CEBWonPaqdLHAj5Ct9LLPu7Dk41dLPaxu',
		'/ip6/2600:3c02::f03c:91ff:fed5:2a0c/tcp/4001/ipfs/QmcR25jursru6CEBWonPaqdLHAj5Ct9LLPu7Dk41dLPaxu',
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
			axios.get('http://127.0.0.1:5001/api/v0/swarm/connect?arg=' + bootnode)
		} catch (e) {}
	})
}

async function pinIpfsHash(ipfsHash) {
	try {
		let encodedIpfsHash = multihashes.toB58String(multihashes.encode(Buffer.from(ipfsHash.substr(2), "hex"), 'sha2-256'))
		console.log(encodedIpfsHash)
		axios.get('http://127.0.0.1:5001/api/v0/pin/add?arg=' + encodedIpfsHash)
		let response = await axios.get('http://127.0.0.1:5001/api/v0/cat?arg=/ipfs/' + encodedIpfsHash)
		console.log(encodedIpfsHash, response.status)
		let itemPayload = await brotli.decompress(Buffer.from(response.data, "binary"))
		let mixins = itemProto.Item.deserializeBinary(itemPayload).getMixinList()
		for (let i = 0; i < mixins.length; i++) {
      let mixinId = '0x' + ('00000000' + mixins[i].getMixinId().toString(16)).slice(-8)
			if (mixinId == '0x12745469') {
				let imageMessage = new jpegImageProto.JpegMipmap.deserializeBinary(mixins[i].getPayload())
				let mipmapList = imageMessage.getMipmapLevelList()
				console.log(mipmapList.length)

				mipmapList.forEach(async mipmap => {
					let encodedIpfsHash = Base58.encode(mipmap.getIpfsHash())
					console.log(encodedIpfsHash)
					axios.get('http://127.0.0.1:5001/api/v0/pin/add?arg=' + encodedIpfsHash)
					let response = await axios.get('http://127.0.0.1:5001/api/v0/cat?arg=/ipfs/' + encodedIpfsHash)
					console.log(encodedIpfsHash, response.status)
				})
      }
    }
	} catch (e) {console.log(e)}
}

async function start() {
	let parityIpcPath = process.env['HOME'] + '/.local/share/io.parity.ethereum/jsonrpc.ipc'
	let web3 = new Web3(new Web3.providers.IpcProvider(parityIpcPath, net))

	let blockNumber = await web3.eth.getBlockNumber()
	console.log('Block: ' + blockNumber.toLocaleString())

	let itemStoreIpfsSha256 = new web3.eth.Contract(ItemStoreIpfsSha256Abi, '0x1c12e8667bd48f87263e0745d7b28ea18f74ac0e')
	itemStoreIpfsSha256.events.PublishRevision({
//		fromBlock: 0,
		toBlock: 'pending',
	})
	.on('data', event => {
		pinIpfsHash(event.returnValues.ipfsHash)
	})

	ipfsInterval = setInterval(connect, 30000)
}

start()
