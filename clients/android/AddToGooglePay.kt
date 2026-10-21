package com.offlinerich.card

import android.app.Activity
import android.os.Parcel
import android.os.Parcelable
import com.stripe.android.pushProvisioning.EphemeralKeyUpdateListener
import com.stripe.android.pushProvisioning.PushProvisioningActivity
import com.stripe.android.pushProvisioning.PushProvisioningActivityStarter
import com.stripe.android.pushProvisioning.PushProvisioningEphemeralKeyProvider
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Android half of Google Pay push provisioning.
 *
 * Dependency: com.stripe:stripe-android-issuing-push-provisioning:1.3.0
 * Plus Google's private TapAndPay SDK 18.8.0, allow-listed in the Issuer Console
 * against Stripe aggregator merchant BCR2DN7TWDCZDZJC.
 *
 * The backend returns the Stripe ephemeral-key JSON from POST /api/wallets/ephemeral-key.
 * Pass that raw JSON to onKeyUpdate. Do not log the secret.
 */
class OfflineRichEphemeralKeyProvider(
    private val apiBase: String,
    private val sessionToken: String,
    private val cardId: String,
) : PushProvisioningEphemeralKeyProvider {
    constructor(parcel: Parcel) : this(
        parcel.readString().orEmpty(),
        parcel.readString().orEmpty(),
        parcel.readString().orEmpty(),
    )

    override fun createEphemeralKey(apiVersion: String, listener: EphemeralKeyUpdateListener) {
        Thread {
            val body = JSONObject()
                .put("cardId", cardId)
                .put("apiVersion", apiVersion)
                .toString()
                .toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$apiBase/api/wallets/ephemeral-key")
                .addHeader("Authorization", "Bearer $sessionToken")
                .post(body)
                .build()
            runCatching { OkHttpClient().newCall(request).execute().body?.string().orEmpty() }
                .onSuccess { listener.onKeyUpdate(it) }
                .onFailure { listener.onKeyUpdateFailure(0, it.message.orEmpty()) }
        }.start()
    }

    override fun writeToParcel(parcel: Parcel, flags: Int) {
        parcel.writeString(apiBase)
        parcel.writeString(sessionToken)
        parcel.writeString(cardId)
    }

    override fun describeContents(): Int = 0

    companion object CREATOR : Parcelable.Creator<OfflineRichEphemeralKeyProvider> {
        override fun createFromParcel(parcel: Parcel) = OfflineRichEphemeralKeyProvider(parcel)
        override fun newArray(size: Int) = arrayOfNulls<OfflineRichEphemeralKeyProvider>(size)
    }
}

fun Activity.addToGooglePay(apiBase: String, sessionToken: String, cardId: String, cardholderName: String) {
    val provider = OfflineRichEphemeralKeyProvider(apiBase, sessionToken, cardId)
    PushProvisioningActivityStarter(
        this,
        PushProvisioningActivityStarter.Args(cardholderName, provider, false),
    ).startForResult()
}

fun Activity.onGooglePayResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
    if (requestCode != PushProvisioningActivityStarter.REQUEST_CODE) return
    if (resultCode == PushProvisioningActivity.RESULT_OK) {
        PushProvisioningActivityStarter.Result.fromIntent(data)
    }
}
