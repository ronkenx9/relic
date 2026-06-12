// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Relic — evolving Kaizenverse fighter relics, forged from on-chain history.
/// @notice Minimal ERC-721. Each token anchors a sheetHash = keccak256 of the forged
///         character sheet (moments evidence + archetype assignment + stats). The kaizen
///         mechanic: `refreshRelic` re-anchors the sheet as the wallet keeps living —
///         the relic improves with its owner. The archetype mapping itself is pinned at
///         deploy (archetypesHash) so assignments are auditable: same rules, same fighter.
/// @dev Deliberately dependency-free and small-surface for auditability.
contract Relic {
    string public constant name = "RELIC x KAIZENVERSE";
    string public constant symbol = "RELIC";

    /// @notice keccak256 of the published archetype mapping (rules + tie-break + version).
    bytes32 public immutable archetypesHash;
    address public immutable forge; // authorized minter (relayer/owner)

    uint256 public nextId = 1;

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    /// tokenId → subject wallet the relic was forged FROM (not necessarily the holder)
    mapping(uint256 => address) public subjectOf;
    /// tokenId → current sheet hash
    mapping(uint256 => bytes32) public sheetHashOf;
    /// tokenId → metadata URI
    mapping(uint256 => string) private _uriOf;
    /// tokenId → number of kaizen refreshes (evolution count)
    mapping(uint256 => uint64) public evolutionOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event RelicForged(uint256 indexed tokenId, address indexed subject, bytes32 sheetHash, string uri);
    event RelicEvolved(uint256 indexed tokenId, bytes32 newSheetHash, string newUri, uint64 evolution);

    error NotForge();
    error NotOwnerNorApproved();
    error ZeroAddress();
    error NoToken();
    error AlreadyForged();

    /// subject → tokenId (one living relic per wallet; refresh, don't re-mint)
    mapping(address => uint256) public relicOf;

    modifier onlyForge() {
        if (msg.sender != forge) revert NotForge();
        _;
    }

    constructor(bytes32 _archetypesHash) {
        archetypesHash = _archetypesHash;
        forge = msg.sender;
    }

    // ---------------- forge / kaizen ----------------

    /// @notice Mint a relic for `subject`, owned by `to` (gasless path: forge pays).
    function mintRelic(address to, address subject, bytes32 sheetHash, string calldata uri)
        external
        onlyForge
        returns (uint256 tokenId)
    {
        if (to == address(0) || subject == address(0)) revert ZeroAddress();
        if (relicOf[subject] != 0) revert AlreadyForged();
        tokenId = nextId++;
        _ownerOf[tokenId] = to;
        unchecked { _balanceOf[to]++; }
        subjectOf[tokenId] = subject;
        sheetHashOf[tokenId] = sheetHash;
        _uriOf[tokenId] = uri;
        relicOf[subject] = tokenId;
        emit Transfer(address(0), to, tokenId);
        emit RelicForged(tokenId, subject, sheetHash, uri);
    }

    /// @notice Kaizen: the wallet kept living — re-anchor its sheet. Stats/archetype may
    ///         evolve; the lineage stays on-chain in RelicEvolved events.
    function refreshRelic(uint256 tokenId, bytes32 newSheetHash, string calldata newUri) external onlyForge {
        if (_ownerOf[tokenId] == address(0)) revert NoToken();
        sheetHashOf[tokenId] = newSheetHash;
        _uriOf[tokenId] = newUri;
        uint64 evo = ++evolutionOf[tokenId];
        emit RelicEvolved(tokenId, newSheetHash, newUri, evo);
    }

    // ---------------- ERC-721 minimal ----------------

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _ownerOf[tokenId];
        if (owner == address(0)) revert NoToken();
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _balanceOf[owner];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf[tokenId] == address(0)) revert NoToken();
        return _uriOf[tokenId];
    }

    function approve(address spender, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert NotOwnerNorApproved();
        getApproved[tokenId] = spender;
        emit Approval(owner, spender, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (to == address(0)) revert ZeroAddress();
        address owner = ownerOf(tokenId);
        if (owner != from) revert NotOwnerNorApproved();
        if (msg.sender != owner && msg.sender != getApproved[tokenId] && !isApprovedForAll[owner][msg.sender]) {
            revert NotOwnerNorApproved();
        }
        delete getApproved[tokenId];
        unchecked {
            _balanceOf[from]--;
            _balanceOf[to]++;
        }
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            require(
                IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data)
                    == IERC721Receiver.onERC721Received.selector,
                "unsafe receiver"
            );
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd || id == 0x5b5e139f || id == 0x01ffc9a7; // 721, 721Metadata, 165
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
