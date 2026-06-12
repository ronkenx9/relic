// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Relic} from "../contracts/Relic.sol";

contract RelicTest {
    Relic relic;
    bytes32 constant ARCH_HASH = keccak256("archetypes-v1.0.0");
    address constant HOLDER = address(0xBEEF);
    address constant SUBJECT = address(0xCAFE);

    function setUp() public {
        relic = new Relic(ARCH_HASH);
    }

    function testArchetypesHashPinned() public view {
        require(relic.archetypesHash() == ARCH_HASH, "archetypes hash pinned at deploy");
    }

    function testForgeMintsAndAnchorsSheet() public {
        bytes32 sheet = keccak256("sheet-v1");
        uint256 id = relic.mintRelic(HOLDER, SUBJECT, sheet, "ipfs://sheet1");
        require(id == 1, "first token is 1");
        require(relic.ownerOf(id) == HOLDER, "owner");
        require(relic.subjectOf(id) == SUBJECT, "subject recorded");
        require(relic.sheetHashOf(id) == sheet, "sheet hash anchored");
        require(relic.relicOf(SUBJECT) == id, "subject -> token index");
        require(keccak256(bytes(relic.tokenURI(id))) == keccak256("ipfs://sheet1"), "uri");
    }

    function testOneRelicPerSubject() public {
        relic.mintRelic(HOLDER, SUBJECT, keccak256("a"), "u1");
        try relic.mintRelic(HOLDER, SUBJECT, keccak256("b"), "u2") returns (uint256) {
            revert("second mint for same subject must revert");
        } catch {}
    }

    function testOnlyForgeMints() public {
        Attacker a = new Attacker();
        require(!a.tryMint(relic), "non-forge mint must revert");
    }

    function testKaizenRefreshEvolves() public {
        uint256 id = relic.mintRelic(HOLDER, SUBJECT, keccak256("v1"), "u1");
        relic.refreshRelic(id, keccak256("v2"), "u2");
        require(relic.sheetHashOf(id) == keccak256("v2"), "sheet evolved");
        require(relic.evolutionOf(id) == 1, "evolution 1");
        relic.refreshRelic(id, keccak256("v3"), "u3");
        require(relic.evolutionOf(id) == 2, "evolution 2");
        require(keccak256(bytes(relic.tokenURI(id))) == keccak256("u3"), "uri evolved");
    }

    function testRefreshNeedsToken() public {
        try relic.refreshRelic(99, keccak256("x"), "u") {
            revert("refresh on missing token must revert");
        } catch {}
    }

    function testTransferRequiresOwnership() public {
        uint256 id = relic.mintRelic(address(this), SUBJECT, keccak256("v1"), "u1");
        relic.transferFrom(address(this), HOLDER, id);
        require(relic.ownerOf(id) == HOLDER, "transferred");
        // we are no longer owner/approved
        try relic.transferFrom(HOLDER, address(this), id) {
            revert("unauthorized transfer must revert");
        } catch {}
    }
}

contract Attacker {
    function tryMint(Relic relic) external returns (bool ok) {
        try relic.mintRelic(address(this), address(this), keccak256("evil"), "u") returns (uint256) {
            ok = true;
        } catch {
            ok = false;
        }
    }
}
