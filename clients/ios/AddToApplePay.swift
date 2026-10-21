import Foundation
import PassKit
import Stripe

/// iPhone half of Apple Pay push provisioning.
/// The server half is POST /api/wallets/ephemeral-key, which creates a Stripe
/// ephemeral key for this account's Issuing card.
///
/// Requires the Apple Pay entitlement and Stripe Issuing wallet approval.
final class AddToApplePay: UIViewController, STPIssuingCardEphemeralKeyProvider, PKAddPaymentPassViewControllerDelegate {
    let apiBase: String
    let sessionToken: String
    let cardId: String
    let cardholderName: String
    let last4: String
    private var pushProvisioningContext: STPPushProvisioningContext?

    init(apiBase: String, sessionToken: String, cardId: String, cardholderName: String, last4: String) {
        self.apiBase = apiBase
        self.sessionToken = sessionToken
        self.cardId = cardId
        self.cardholderName = cardholderName
        self.last4 = last4
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { nil }

    func presentAddToApplePay() {
        guard let configuration = PKAddPaymentPassRequestConfiguration(encryptionScheme: .ECC_V2) else { return }
        configuration.cardholderName = cardholderName
        configuration.primaryAccountSuffix = last4
        configuration.paymentNetwork = .visa
        guard let controller = PKAddPaymentPassViewController(requestConfiguration: configuration, delegate: self) else { return }
        present(controller, animated: true)
    }

    func createIssuingCardKey(withAPIVersion apiVersion: String, completion: @escaping STPJSONResponseCompletionBlock) {
        var request = URLRequest(url: URL(string: "\(apiBase)/api/wallets/ephemeral-key")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "cardId": cardId,
            "apiVersion": apiVersion,
        ])
        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error {
                completion(nil, error)
                return
            }
            guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [AnyHashable: Any] else {
                completion(nil, NSError(domain: "OfflineRich", code: 0))
                return
            }
            completion(json, nil)
        }.resume()
    }

    func addPaymentPassViewController(
        _ controller: PKAddPaymentPassViewController,
        generateRequestWithCertificateChain certificates: [Data],
        nonce: Data,
        nonceSignature: Data,
        completionHandler handler: @escaping (PKAddPaymentPassRequest) -> Void
    ) {
        pushProvisioningContext = STPPushProvisioningContext(keyProvider: self)
        pushProvisioningContext?.addPaymentPassViewController(
            controller,
            generateRequestWithCertificateChain: certificates,
            nonce: nonce,
            nonceSignature: nonceSignature,
            completionHandler: handler
        )
    }

    func addPaymentPassViewController(_ controller: PKAddPaymentPassViewController, didFinishAdding pass: PKPaymentPass?, error: Error?) {
        dismiss(animated: true)
    }
}
