#!/usr/bin/env node

const program = require('commander')
const { contractId } = require('../utils/helpers')

program
  .option('-i, --input [name]', 'name of the contract to be hashed, Case Sensitive')
  .parse(process.argv)

console.log(`${program.input}: ${contractId(program.input)}`)
