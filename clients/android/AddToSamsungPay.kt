package com.offlinerich.card

import android.os.Bundle
import com.samsung.android.sdk.samsungpay.v2.SamsungPay
import com.samsung.android.sdk.samsungpay.v2.StatusListener
import com.samsung.android.sdk.samsungpay.v2.card.AddCardInfo
import com.samsung.android.sdk.samsungpay.v2.card.AddCardListener
import com.samsung.android.sdk.samsungpay.v2.card.Card
import com.samsung.android.sdk.samsungpay.v2.card.CardManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Samsung Pay push provisioning.
 *
 * Manual add does not need this file: the wallet sends a one-time code to the
 * cardholder phone or email stored on the Stripe cardholder.
 *
 * Push provisioning:
 * 1. SamsungPay.getWalletInfo returns DEVICE_ID and WALLET_USER_ID.
 * 2. POST /api/wallets/samsung with those ids.
 * 3. The server calls Visa POST /inapp/provisioning/cardData/samsungPay and
 *    returns opaquePaymentCard. The PAN never comes back to the phone.
 * 4. CardManager.addCard puts that payload in EXTRA_PROVISION_PAYLOAD.
 */
fun addToSamsungPay(
    samsungPay: SamsungPay,
    cardManager: CardManager,
    apiBase: String,
    sessionToken: String,
    listener: AddCardListener,
) {
    val keys = arrayListOf(SamsungPay.WALLET_USER_ID, SamsungPay.DEVICE_ID)
    samsungPay.getWalletInfo(keys, object : StatusListener {
        override fun onSuccess(status: Int, wallet: Bundle) {
            val body = JSONObject()
                .put("deviceId", wallet.getString(SamsungPay.DEVICE_ID))
                .put("walletUserId", wallet.getString(SamsungPay.WALLET_USER_ID))
                .toString()
                .toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$apiBase/api/wallets/samsung")
                .addHeader("Authorization", "Bearer $sessionToken")
                .post(body)
                .build()
            val raw = OkHttpClient().newCall(request).execute().body?.string().orEmpty()
            val json = JSONObject(raw)
            val payload = json.getString("opaquePaymentCard")
            val details = Bundle()
            details.putString(AddCardInfo.EXTRA_PROVISION_PAYLOAD, payload)
            val issuerId = json.optJSONObject("addCardInfo")?.optString("issuerId").orEmpty()
            if (issuerId.isNotEmpty()) details.putString(AddCardInfo.EXTRA_ISSUER_ID, issuerId)
            val info = AddCardInfo(Card.CARD_TYPE_DEBIT, AddCardInfo.PROVIDER_VISA, details)
            cardManager.addCard(info, listener)
        }

        override fun onFail(errorCode: Int, errorData: Bundle?) = Unit
    })
}
