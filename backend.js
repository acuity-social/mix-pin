"use strict";

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8645"));
web3.eth.defaultBlock = "pending";

const itemStoreIpfsSha256Abi = require('./mix-item-store/item_store_ipfs_sha256.abi.json');
const itemStoreIpfsSha256Factory = web3.eth.contract(itemStoreIpfsSha256Abi);
const itemStoreIpfsSha256Address = "0xab4aa658083cd937c40a369cbd2c81ef3939999f";
const itemStoreIpfsSha256 = itemStoreIpfsSha256Factory.at(itemStoreIpfsSha256Address);
const eventPublishRevision = "0xa42468235cfdba0d7adbc48b79ee2a88f02cf52f20de70c669aaad7fd3e21585";

const multihashes = require('multihashes');
const request = require('request');

web3.eth.filter({fromBlock: 0, toBlock: 'pending', address: itemStoreIpfsSha256Address, topics: [eventPublishRevision]}).watch(function(error, result) {
  if (error) { callback(error); return; }
  const ipfsHash = result.data.substr(66, 64);
  const base58IpfsHash = multihashes.toB58String(multihashes.encode(Buffer.from(ipfsHash, "hex"), 'sha2-256'));

  request
    .get('http://127.0.0.1:5001/api/v0/pin/add?arg=/ipfs/' + base58IpfsHash)
    .on('response', function(response) {
      if (response.statusCode == 200) {
        console.log(base58IpfsHash);
      }
    })
});
