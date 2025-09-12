import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import RNOtpVerify from 'react-native-otp-verify';
import { WebView } from 'react-native-webview';

type WebViewMessage = {
  type: string;
  [key: string]: any;
};

type PermissionStatus = {
  gallery: boolean;
  location: boolean;
  microphone: boolean;
  camera: boolean;
};

export default function HomeScreen() {
  const websiteUrl = 'https://vivinet.ir';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [permissions, setPermissions] = useState<PermissionStatus>({
    gallery: false,
    location: false,
    microphone: false,
    camera: false
  });
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    requestAllPermissions();
    setupOtpListener();
    return () => {
      RNOtpVerify.removeListener();
    };
  }, []);

  const setupOtpListener = () => {
    RNOtpVerify.getHash()
      .then((hash) => {
        console.log('App hash for SMS Retriever:', hash);
        // این hash رو به backend بفرست برای استفاده در SMS
      })
      .catch((error) => console.log('خطا در گرفتن hash:', error));

    RNOtpVerify.getOtp()
      .then(() => RNOtpVerify.addListener(otpHandler))
      .catch((error) => console.log('خطا در شروع listener:', error));
  };

  const otpHandler = (message: string) => {
    console.log('پیام SMS دریافت شد:', message);
    const otpMatch = message.match(/\d{4}/); // فرض بر OTP 4 رقمی
    const otp = otpMatch ? otpMatch[0] : null;
    if (otp) {
      console.log('OTP استخراج شده:', otp);
      sendToWebView({
        type: 'otpReceived',
        otp: otp
      });
      RNOtpVerify.removeListener();
    }
  };

  const requestAllPermissions = async () => {
    try {
      const galleryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      const microphoneStatus = await Audio.requestPermissionsAsync();
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();

      const newPermissions = {
        gallery: galleryStatus.status === 'granted',
        location: locationStatus.status === 'granted',
        microphone: microphoneStatus.status === 'granted',
        camera: cameraStatus.status === 'granted'
      };

      setPermissions(newPermissions);
      console.log('وضعیت دسترسی‌ها:', newPermissions);

      sendToWebView({
        type: 'permissionsStatus',
        permissions: newPermissions
      });

    } catch (error) {
      console.log('خطا در درخواست دسترسی‌ها:', error);
      setError(true);
      setErrorMessage('خطا در درخواست دسترسی‌ها');
    }
  };

  const sendToWebView = (data: WebViewMessage) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(data));
    }
  };

  const takePhotoWithCamera = async () => {
    if (!permissions.camera) {
      Alert.alert('خطا', 'دسترسی به دوربین داده نشده است');
      return null;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const imageData = {
          uri: asset.uri,
          base64: base64,
          fileName: `camera_${Date.now()}.jpg`,
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        };

        sendToWebView({
          type: 'cameraPhoto',
          image: imageData
        });

        return imageData;
      }
      return null;
    } catch (error) {
      console.log('خطا در گرفتن عکس با دوربین:', error);
      sendToWebView({
        type: 'error',
        message: 'خطا در دسترسی به دوربین'
      });
      return null;
    }
  };

  const getAllGalleryImages = async () => {
    if (!permissions.gallery) {
      Alert.alert('خطا', 'دسترسی به گالری داده نشده است');
      return [];
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const imagesData = await Promise.all(
          result.assets.map(async (asset) => {
            const base64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            return {
              uri: asset.uri,
              base64: base64,
              fileName: asset.uri.split('/').pop() || 'image.jpg',
              width: asset.width,
              height: asset.height,
              fileSize: asset.fileSize,
              mimeType: asset.mimeType || 'image/jpeg',
            };
          })
        );

        sendToWebView({
          type: 'galleryImages',
          images: imagesData
        });

        return imagesData;
      }
      return [];
    } catch (error) {
      console.log('خطا در گرفتن عکس‌ها:', error);
      sendToWebView({
        type: 'error',
        message: 'خطا در دسترسی به گالری'
      });
      return [];
    }
  };

  const getCurrentLocation = async () => {
    if (!permissions.location) {
      Alert.alert('خطا', 'دسترسی به موقعیت مکانی داده نشده است');
      return null;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      sendToWebView({
        type: 'locationData',
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy
        }
      });

      return location;
    } catch (error) {
      console.log('خطا در گرفتن موقعیت:', error);
      sendToWebView({
        type: 'error',
        message: 'خطا در دریافت موقعیت'
      });
      return null;
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.type === 'success') {
        sendToWebView({
          type: 'documentPicked',
          document: {
            uri: result.uri,
            name: result.name,
            size: result.size,
            mimeType: result.mimeType
          }
        });
        return result;
      }
      return null;
    } catch (error) {
      console.log('خطا در انتخاب سند:', error);
      sendToWebView({
        type: 'error',
        message: 'خطا در انتخاب فایل'
      });
      return null;
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('پیام دریافت شده:', data);

      switch (data.type) {
        case 'requestGalleryImages':
          await getAllGalleryImages();
          break;

        case 'requestLocation':
          await getCurrentLocation();
          break;

        case 'pickDocument':
          await pickDocument();
          break;

        case 'takePhoto':
          await takePhotoWithCamera();
          break;

        case 'requestPermissions':
          await requestAllPermissions();
          break;

        case 'selectImage':
          console.log('عکس انتخاب شده:', data.imageUri);
          break;

        default:
          console.log('نوع پیام ناشناخته:', data.type);
      }
    } catch (error) {
      console.log('خطا در پردازش پیام:', error);
    }
  };

  const handleWebViewError = () => {
    setLoading(false);
    setError(true);
    setErrorMessage('خطا در بارگذاری صفحه');
  };

  return (
    <>
      <StatusBar 
        barStyle="light-content"
        backgroundColor="#0066cc"
        translucent={false}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0066cc' }}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator 
              size="large" 
              color="#ffffff" 
              style={styles.loader}
            />
            <Text style={styles.loadingText}>
              در حال بارگذاری...
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️</Text>
            <Text style={styles.errorMessage}>
              {errorMessage}
            </Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: websiteUrl }}
          style={{ flex: 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          startInLoadingState={false}
          onLoadStart={() => {
            setLoading(true);
            setError(false);
          }}
          onLoadEnd={() => {
            setLoading(false);
          }}
          onError={handleWebViewError}
          onHttpError={handleWebViewError}
          onMessage={handleWebViewMessage}
          userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36"
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0066cc',
    zIndex: 999,
  },
  loader: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#ffffff',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0066cc',
    zIndex: 999,
  },
  errorText: {
    fontSize: 40,
    marginBottom: 15,
    color: '#ffffff',
  },
  errorMessage: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
});