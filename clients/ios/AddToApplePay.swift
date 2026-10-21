import Foundation
import PassKit
import UIKit

/// iPhone half of Apple Pay for an Immersve Mastercard.
/// PassKit supplies the certificate chain. This class posts it to
/// POST /api/wallets/apple and returns the Immersve payload to PassKit.
final class AddToApplePay: UIViewController, PKAddPaymentPassViewControllerDelegate {
    let apiBase: String
    let sessionToken: String
    let cardId: String
    let cardholderName: String
    let last4: String
    let primaryAccountIdentifier: String

    init(apiBase: String, sessionToken: String, cardId: String, cardholderName: String, last4: String, primaryAccountIdentifier: String) {
        self.apiBase = apiBase
        self.sessionToken = sessionToken
        self.cardId = cardId
        self.cardholderName = cardholderName
        self.last4 = last4
        self.primaryAccountIdentifier = primaryAccountIdentifier
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { nil }

    func presentAddToApplePay() {
        guard let configuration = PKAddPaymentPassRequestConfiguration(encryptionScheme: .ECC_V2) else { return }
        configuration.cardholderName = cardholderName
        configuration.primaryAccountSuffix = last4
        configuration.primaryAccountIdentifier = primaryAccountIdentifier
        configuration.paymentNetwork = .masterCard
        guard let controller = PKAddPaymentPassViewController(requestConfiguration: configuration, delegate: self) else { return }
        present(controller, animated: true)
    }

    func addPaymentPassViewController(
        _ controller: PKAddPaymentPassViewController,
        generateRequestWithCertificateChain certificates: [Data],
        nonce: Data,
        nonceSignature: Data,
        completionHandler handler: @escaping (PKAddPaymentPassRequest) -> Void
    ) {
        var request = URLRequest(url: URL(string: "\(apiBase)/api/wallets/apple")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "cardId": cardId,
            "certChain": certificates.map { $0.base64EncodedString() },
            "nonce": nonce.base64EncodedString(),
            "nonceSignature": nonceSignature.base64EncodedString(),
        ])
        URLSession.shared.dataTask(with: request) { data, _, _ in
            let payload = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [String: Any]
            let pass = PKAddPaymentPassRequest()
            if let encrypted = payload?["encryptedPassData"] as? String { pass.encryptedPassData = Data(base64Encoded: encrypted) }
            if let key = payload?["ephemeralPublicKey"] as? String { pass.ephemeralPublicKey = Data(base64Encoded: key) }
            if let activation = payload?["activationData"] as? String { pass.activationData = Data(base64Encoded: activation) }
            handler(pass)
        }.resume()
    }

    func addPaymentPassViewController(_ controller: PKAddPaymentPassViewController, didFinishAdding pass: PKPaymentPass?, error: Error?) {
        dismiss(animated: true)
    }
}
