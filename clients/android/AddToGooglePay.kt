package com.offlinerich.card

import android.app.Activity
import android.content.Intent
import android.net.Uri
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Google Pay for an Immersve card is a manual add.
 * This asks the server for the one-time secure card link and opens it.
 * The cardholder types that number into Google Wallet.
 */
class AddToGooglePay(
    private val activity: Activity,
    private val apiBase: String,
    private val sessionToken: String,
) {
    private val http = OkHttpClient()

    fun openSecureCard() {
        val request = Request.Builder()
            .url("$apiBase/api/wallets/secure-details")
            .post("{}".toRequestBody("application/json".toMediaType()))
            .header("Authorization", "Bearer $sessionToken")
            .build()
        http.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) = Unit
            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                val url = JSONObject(response.body?.string() ?: "{}").optString("callbackUrl")
                if (url.startsWith("https://")) {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            }
        })
    }
}
