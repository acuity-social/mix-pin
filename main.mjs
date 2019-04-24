import Web3 from 'web3'
import net from 'net'
import ItemStoreIpfsSha256Abi from './ItemStoreIpfsSha256.abi.json'
import multihashes from 'multihashes'
import Base58 from 'base-58'
import axios from 'axios'
import brotli from 'iltorb'
import itemProto from './item_pb.js'
import jpegImageProto from './jpeg-image_pb.js'

async function pinIpfsHash(ipfsHash) {
	try {
		let encodedIpfsHash = multihashes.toB58String(multihashes.encode(Buffer.from(ipfsHash.substr(2), "hex"), 'sha2-256'))
		console.log(encodedIpfsHash)
		await axios.get('http://127.0.0.1:5001/api/v0/pin/add?arg=' + encodedIpfsHash)
		let response = await axios.get('http://127.0.0.1:5001/api/v0/cat?arg=/ipfs/' + encodedIpfsHash)
		console.log(response.status)
		let itemPayload = await brotli.decompress(Buffer.from(response.data, "binary"))
		let mixins = itemProto.Item.deserializeBinary(itemPayload).getMixinList()
		for (let i = 0; i < mixins.length; i++) {
      let mixinId = '0x' + ('00000000' + mixins[i].getMixinId().toString(16)).slice(-8)
			if (mixinId == '0x12745469') {
				let imageMessage = new jpegImageProto.JpegMipmap.deserializeBinary(mixins[i].getPayload())
				let mipmapList = imageMessage.getMipmapLevelList()
				console.log(mipmapList.length)

				for (let mipmap of mipmapList) {
					let encodedIpfsHash = Base58.encode(mipmap.getIpfsHash())
					console.log(encodedIpfsHash)
					await axios.get('http://127.0.0.1:5001/api/v0/pin/add?arg=' + encodedIpfsHash)
				}
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
}

start()
