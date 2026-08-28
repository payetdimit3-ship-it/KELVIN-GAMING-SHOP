const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. HELPER: Kusafisha namba ya simu (Formating to 255XXXXXXXXX)
function formatPhoneNumber(phone) {
  let cleaned = phone.toString().replace(/\D/g, ''); // Ondoa alama yoyote isiyo namba
  if (cleaned.startsWith('0')) {
    cleaned = '255' + cleaned.substring(1);
  } else if (cleaned.startsWith('8255')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

// 2. HELPER: Kutambua Mtandao kulingana na namba (Provider Detection)
function detectProvider(phone) {
  const number = formatPhoneNumber(phone);
  const prefix = number.substring(3, 5); // Tarakimu za 4 na 5 (mfano 25578... -> 78)

  // Vodacom / M-Pesa (74, 75, 76)
  if (['74', '75', '76'].includes(prefix)) return 'Airtel'; // au 'Mpesa' kulingana na AzamPay setup, mara nyingi AzamPay inatumia: 'Airtel', 'Azampay', 'Tigo', 'Halopesa'
  
  // Airtel (78, 79, 68, 69)
  if (['78', '79', '68', '69'].includes(prefix)) return 'Airtel';
  
  // Tigo (71, 65, 67, 77)
  if (['71', '65', '67', '77'].includes(prefix)) return 'Tigo';
  
  // Halotel (62, 61)
  if (['62', '61'].includes(prefix)) return 'Halopesa';

  return 'Airtel'; // Default provider ikifeli
}

// 3. AZAMPAY AUTHENTICATION FUNCTION (Kupata Access Token)
async function getAzamPayToken() {
  const isSandbox = process.env.AZAMPAY_ENV === 'sandbox';
  const authUrl = isSandbox
    ? 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken'
    : 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken';

  try {
    const response = await axios.post(
      authUrl,
      {
        appName: process.env.AZAMPAY_APP_NAME,
        clientId: process.env.AZAMPAY_CLIENT_ID,
        clientSecret: process.env.AZAMPAY_CLIENT_SECRET,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data && response.data.data && response.data.data.accessToken) {
      return response.data.data.accessToken;
    }

    throw new Error('Imefeli kupata Token: ' + JSON.stringify(response.data));
  } catch (error) {
    console.error('AzamPay Auth Error:', error.response?.data || error.message);
    throw new Error('Authentication failed: Invalid client details');
  }
}

// 4. ROUTE YA CHECKOUT (Malipo Automatic)
app.post('/api/checkout', async (req, res) => {
  try {
    const { phoneNumber, amount, externalId } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Tafadhali weka namba ya simu na kiasi cha fedha.',
      });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const provider = detectProvider(formattedPhone);

    // Kupata token
    const token = await getAzamPayToken();

    const isSandbox = process.env.AZAMPAY_ENV === 'sandbox';
    const checkoutUrl = isSandbox
      ? 'https://checkout-sandbox.azampay.co.tz/azampay/mno/checkout'
      : 'https://checkout.azampay.co.tz/azampay/mno/checkout';

    const payload = {
      accountNumber: formattedPhone,
      amount: amount.toString(),
      currency: 'TZS',
      externalId: externalId || `TXN-${Date.now()}`,
      provider: provider,
    };

    const checkoutResponse = await axios.post(checkoutUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return res.json({
      success: true,
      data: checkoutResponse.data,
    });
  } catch (error) {
    console.error('AzamPay Checkout Error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server inafanya kazi kwenye port ${PORT}`);
});
