// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Non-upgradeable settlement for a fixed conventional ERC20 test asset.
/// Evaluators can attest/revoke; no account can edit signatures, recipients, or purchases.
contract AssetMarket is EIP712, ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant TERMS_TYPEHASH = keccak256("Terms(address seller,bytes32 versionKey,bytes32 fileHash,bytes32 reportHash,bytes32 licenseHash,uint256 sellerAmount,uint256 platformFee,uint256 maxDiscount,uint256 validUntil,uint256 nonce)");
    IERC20 public immutable paymentToken;
    address public immutable feeRecipient;

    struct Terms {
        address seller; bytes32 versionKey; bytes32 fileHash; bytes32 reportHash; bytes32 licenseHash;
        uint256 sellerAmount; uint256 platformFee; uint256 maxDiscount; uint256 validUntil; uint256 nonce;
    }
    struct Attestation { bytes32 fileHash; bytes32 reportHash; address seller; bool active; }
    mapping(bytes32 => Attestation) public attestations;
    mapping(address => mapping(bytes32 => bool)) public entitlements;
    mapping(address => mapping(bytes32 => bool)) public usedOrders;
    mapping(address => mapping(uint256 => bool)) public cancelledNonces;

    error InvalidTerms(); error InvalidSignature(); error InvalidAttestation();
    error InvalidOrder(); error AlreadyOwned(); error Expired(); error InvalidDiscount();
    event Attested(bytes32 indexed versionKey, bytes32 fileHash, bytes32 reportHash, address seller, bool active);
    event OfferCancelled(address indexed seller, uint256 nonce);
    event ItemPurchased(address indexed buyer, bytes32 indexed orderId, bytes32 indexed versionKey, address seller, uint256 sellerAmount, uint256 platformAmount, bytes32 fileHash, bytes32 licenseHash);
    event OrderPurchased(address indexed buyer, bytes32 indexed orderId, uint256 total);

    constructor(address token, address recipient, address validator) EIP712("AI Asset Market", "1") {
        if (token == address(0) || recipient == address(0) || validator == address(0)) revert InvalidTerms();
        paymentToken = IERC20(token); feeRecipient = recipient;
        // No DEFAULT_ADMIN_ROLE is granted: validator membership cannot be changed.
        _grantRole(VALIDATOR_ROLE, validator);
    }

    function attest(bytes32 key, bytes32 fileHash, bytes32 reportHash, address seller, bool active) external onlyRole(VALIDATOR_ROLE) {
        if (key == bytes32(0) || fileHash == bytes32(0) || reportHash == bytes32(0) || seller == address(0)) revert InvalidTerms();
        Attestation memory prior = attestations[key];
        if (prior.fileHash != bytes32(0) && (prior.fileHash != fileHash || prior.seller != seller)) revert InvalidAttestation();
        attestations[key] = Attestation(fileHash, reportHash, seller, active);
        emit Attested(key, fileHash, reportHash, seller, active);
    }

    function cancelOffer(uint256 nonce) external {
        cancelledNonces[msg.sender][nonce] = true;
        emit OfferCancelled(msg.sender, nonce);
    }

    function hashTerms(Terms calldata t) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(TERMS_TYPEHASH, t)));
    }

    function purchase(Terms[] calldata terms, bytes[] calldata signatures, uint256[] calldata discounts, bytes32 orderId, uint256 deadline, uint256 expectedTotal) external nonReentrant {
        uint256 length = terms.length;
        if (length == 0 || length > 8 || signatures.length != length || discounts.length != length || orderId == bytes32(0) || usedOrders[msg.sender][orderId]) revert InvalidOrder();
        if (block.timestamp > deadline) revert Expired();
        uint256 total;
        usedOrders[msg.sender][orderId] = true;
        for (uint256 i; i < length; ++i) {
            Terms calldata t = terms[i];
            if (t.seller == address(0) || t.sellerAmount == 0 || t.licenseHash == bytes32(0) || cancelledNonces[t.seller][t.nonce]) revert InvalidTerms();
            if (block.timestamp > t.validUntil) revert Expired();
            if (t.maxDiscount > t.platformFee || discounts[i] > t.maxDiscount) revert InvalidDiscount();
            Attestation memory a = attestations[t.versionKey];
            if (!a.active || a.fileHash != t.fileHash || a.reportHash != t.reportHash || a.seller != t.seller) revert InvalidAttestation();
            if (!SignatureChecker.isValidSignatureNow(t.seller, hashTerms(t), signatures[i])) revert InvalidSignature();
            if (entitlements[msg.sender][t.versionKey]) revert AlreadyOwned();
            entitlements[msg.sender][t.versionKey] = true;
            total += t.sellerAmount + t.platformFee - discounts[i];
        }
        if (total != expectedTotal) revert InvalidOrder();
        for (uint256 i; i < length; ++i) {
            Terms calldata t = terms[i];
            uint256 platformAmount = t.platformFee - discounts[i];
            paymentToken.safeTransferFrom(msg.sender, t.seller, t.sellerAmount);
            if (platformAmount > 0) paymentToken.safeTransferFrom(msg.sender, feeRecipient, platformAmount);
            emit ItemPurchased(msg.sender, orderId, t.versionKey, t.seller, t.sellerAmount, platformAmount, t.fileHash, t.licenseHash);
        }
        emit OrderPurchased(msg.sender, orderId, total);
    }
}
