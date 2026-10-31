export const CELO_SEPOLIA_CHAIN_ID = 11142220 as const;
export const CELOHT_GOVERNANCE_ADDRESS = "0x7D384851FAbB912287206556479Dd30c740CAdA5" as const;
export const CELOHT_USDM_ADDRESS = "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as const;

export const CeloHTGovernanceAbi = [
  {
    type: "function",
    name: "getProposal",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{
      name: "proposal",
      type: "tuple",
      components: [
        { name: "proposalId", type: "uint256" },
        { name: "proposer", type: "address" },
        { name: "contentHash", type: "bytes32" },
        { name: "metadataURI", type: "string" },
        { name: "startTime", type: "uint64" },
        { name: "endTime", type: "uint64" },
        { name: "yesVotes", type: "uint256" },
        { name: "noVotes", type: "uint256" },
        { name: "abstainVotes", type: "uint256" },
        { name: "finalized", type: "bool" },
      ],
    }],
  },
  {
    type: "function",
    name: "hasVoted",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }, { name: "voter", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "participationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "usdm",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "PROPOSER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "VoteCast",
    anonymous: false,
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
      { name: "option", type: "uint8", indexed: false },
    ],
  },
] as const;

export const USDmAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;