import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonItemDivider, IonLabel, IonList, IonModal, IonPage, IonTitle, IonToolbar, isPlatform, useIonActionSheet, useIonModal, useIonToast } from "@ionic/react";
import { cameraOutline, documentOutline,  ellipsisVerticalOutline,  imageOutline,  settingsOutline, shareOutline } from 'ionicons/icons';
import Dynamsoft from 'mobile-web-capture';
import { WebTwain } from "mobile-web-capture/dist/types/WebTwain";
import { DeviceConfiguration } from "mobile-web-capture/dist/types/WebTwain.Acquire";
import { useEffect, useState } from "react";
import { RouteComponentProps } from "react-router";
import Scanner from "../components/Scanner";
import { ScanSettings } from "./Settings";
import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from "@capacitor/core";
import { Toast } from '@capacitor/toast';
import { Base64Result } from "mobile-web-capture/dist/types/WebTwain.IO";
import "../styles/Scanner.css";
import ReactDOM from "react-dom";

let scanners:string[] = [];
let DWObject:WebTwain;

const Home: React.FC<RouteComponentProps> = (props:RouteComponentProps) => {
  const [present, dismiss] = useIonActionSheet();
  const [scan,setScan] = useState(false);
  const [showEditor,setShowEditor] = useState(false);
  const [showCheckbox,setShowCheckbox] = useState(false);
  const [remoteScan,setRemoteScan] = useState(false);
  const [remoteIP,setRemoteIP] = useState(""); // leave the value empty
  const [license,setLicense] = useState("");
  const [usePublicTrial,setUsePublicTrial] = useState(false);
  const [deviceConfiguration, setDeviceConfiguration] = useState<DeviceConfiguration|undefined>(undefined);

  const loadSettings = () => {
    const settingsAsJSON = localStorage.getItem("settings");
    if (settingsAsJSON) {
      let settings:ScanSettings = JSON.parse(settingsAsJSON);
      let deviceConfig:DeviceConfiguration = {
        SelectSourceByIndex: settings.selectedIndex,
        ShowRemoteScanUI: settings.showUI,
        IfShowUI: settings.showUI,
        IfFeederEnabled: settings.autoFeeder,
        IfDuplexEnabled: settings.duplex,
        PixelType: settings.pixelType,
        Resolution: settings.resolution,
        RemoteScan: true
      }
      setDeviceConfiguration(deviceConfig);
    }

    const IP = localStorage.getItem("IP");
   
    if (IP) {
      setRemoteIP(IP);
    }
  }

  const loadLicense = () => {
    const previousLicense = localStorage.getItem("license");
    if (previousLicense) {
      setLicense(previousLicense);
    }
    return previousLicense;
  }

  const checkAndRequestCameraPermission = async () => {
    let result = await AndroidPermissions.checkPermission(AndroidPermissions.PERMISSION.CAMERA);
    if (result.hasPermission == false) {
      let response = await AndroidPermissions.requestPermission(AndroidPermissions.PERMISSION.CAMERA);
      console.log(response.hasPermission);
    }
  }

  useEffect(() => {
    console.log("on mount");
    if (isPlatform("android")) {
      checkAndRequestCameraPermission();
    }

    const previousLicense = loadLicense();

    if (!previousLicense) {
      const enablePublicTrial = () => {
        setUsePublicTrial(true);
      }
      present({
        buttons: [{ text: 'Set a license', handler: goToSettings }, 
                  { text: 'Use public trial', handler: enablePublicTrial }, ],
        header: 'License not set'
      })
    }
  }, []);

  useEffect(() => {
    const state = props.location.state as { settingsSaved:boolean };
    console.log(state);
    
    if (state && state.settingsSaved == true) {
      console.log(state.settingsSaved);
      loadSettings();
      loadLicense();
    }
  }, [props.location.state]);

  const onScannerListLoaded = (list:string[]) => {
    console.log("onScannerListLoaded");
    console.log(list);
    scanners = list;
  };

  const goToSettings = () => {
    props.history.push("settings",{scanners:scanners});
  }

  const resetScanStateDelayed = () => {
    const reset = () => {
      setScan(false);
      setRemoteScan(false);
    }
    setTimeout(reset,1000);
  }

  const getImageIndices = () => {
    var indices = [];
    if (DWObject) {
      for (var i=0;i<DWObject.HowManyImagesInBuffer;i++){
        indices.push(i)
      }
    }
    return indices;
  }

  const showImageActionSheet = () => {
    const toggleMultipleSelection = () => {
      setShowCheckbox(!showCheckbox);
    }

    const deleteSelected = () => {
      if (DWObject) {
        DWObject.RemoveAllSelectedImages();
      }
    }

    const editSelected = () => {
      if (DWObject) {
        setShowEditor(true);
      }
      const reset = () => {
        setShowEditor(false);
      }
      setTimeout(reset,1000);
    }

    present({
      buttons: [{ text: 'Toggle multiple selection', handler: toggleMultipleSelection }, 
                { text: 'Delete selected', handler: deleteSelected }, 
                { text: 'Edit selected', handler: editSelected }, 
                { text: 'Cancel' } ],
      header: 'Select an action'
    })
  }

  const loadFile = () => {
    if (DWObject) {
      present({
        buttons: 
        [{ text: 'PDF', handler: () => {
          DWObject.LoadImageEx("", Dynamsoft.DWT.EnumDWT_ImageType.IT_PDF);
        } }, 
        { text: 'Image', handler: () => {
          DWObject.LoadImageEx("", Dynamsoft.DWT.EnumDWT_ImageType.IT_ALL);
        }}, 
        { text: 'Cancel' } ],
        header: 'Select file type'
      })
    }
  }

  const showShareActionSheet = () => {
    const save = () => {
      if (DWObject) {
        if (Capacitor.isNativePlatform()) {
          const OnSuccess = async (result:Base64Result, indices:number[], type:number) => {
            console.log('successful');
            let writingResult = await Filesystem.writeFile({
              path: getFormattedDate()+".pdf",
              data: result.getData(0,result.getLength()),
              directory: Directory.External
            })
            await Toast.show({
              text: "File is written to "+writingResult.uri,
              duration: "long"
            });
          }
    
          const OnFailure = () => {
            console.log('error');
          }
          DWObject.ConvertToBase64(getImageIndices(),Dynamsoft.DWT.EnumDWT_ImageType.IT_PDF,OnSuccess,OnFailure)
          
        }else{
          const OnSuccess = () => {
            console.log('successful');
          }
    
          const OnFailure = () => {
            console.log('error');
          }
          DWObject.SaveAllAsPDF("Scanned.pdf",OnSuccess,OnFailure);
        }
      }
    }

    const getFormattedDate = () => {
      let date = new Date();

      let month = date.getMonth() + 1;
      let day = date.getDate();
      let hour = date.getHours();
      let min = date.getMinutes();
      let sec = date.getSeconds();

      let monthStr = (month < 10 ? "0" : "") + month;
      let dayStr = (day < 10 ? "0" : "") + day;
      let hourStr = (hour < 10 ? "0" : "") + hour;
      let minStr = (min < 10 ? "0" : "") + min;
      let secStr = (sec < 10 ? "0" : "") + sec;

      var str = date.getFullYear().toString() + monthStr + dayStr + hourStr + minStr + secStr;

      return str;
  }
    const share = () => {
      console.log("share");
      if (Capacitor.isNativePlatform()) {
        const success = async (result:Base64Result, indices:number[], type:number) => {
          let fileName = getFormattedDate()+".pdf";
          let writingResult = await Filesystem.writeFile({
            path: fileName,
            data: result.getData(0,result.getLength()),
            directory: Directory.Cache
          });
          Share.share({
            title: fileName,
            text: fileName,
            url: writingResult.uri,
          });
        }
        
        const failure = (errorCode:number, errorString:string) => {
          console.log(errorString);
        }

        if (DWObject) {
          DWObject.ConvertToBase64(getImageIndices(),Dynamsoft.DWT.EnumDWT_ImageType.IT_PDF,success,failure)
        }
      }else{
        if (window.location.protocol == "http:") {
          alert("Only available to secure context.");
          return;
        }
        const success = async (result:Blob, indices:number[], type:number) => {
          let pdf:File = new File([result],"scanned.pdf");
          const data:ShareData = {files:[pdf]};
          await navigator.share(data);
        }
        
        const failure = (errorCode:number, errorString:string) => {
          console.log(errorString);
        }
        if (DWObject) {
          DWObject.ConvertToBlob(getImageIndices(),Dynamsoft.DWT.EnumDWT_ImageType.IT_PDF,success,failure)
        }
      }
      
    }
    
    present({
      buttons: [{ text: 'Save as PDF', handler:save }, { text: 'Export to PDF and share', handler:share }, { text: 'Cancel' } ],
      header: 'Select an action'
    })
  }

  const renderScanner = () => {
    if (!license && usePublicTrial === false) {
      return (
        <>
          <p>Please set a license. Refresh may be needed to update a license.</p>
        </>
      );
    }else{
      console.log("use license: "+license);
      return (
        <>
          <Scanner scan={scan} 
            remoteScan={remoteScan} 
            width={"100%"} 
            height={"100%"} 
            license={license}
            remoteIP={remoteIP}
            deviceConfig={deviceConfiguration}
            onWebTWAINReady={(dwt) =>{ DWObject = dwt; loadSettings(); }}
            showEditor={showEditor}
            showCheckbox={showCheckbox}
            onScannerListLoaded={onScannerListLoaded} 
            onRemoteServiceConnected={(success) =>{
              if (success == false) {
                localStorage.removeItem("IP");
              }
            }}
            onScanned={(success) => {
              if (success == false) {
                alert("Failed. Please check your settings.");
              }
            }} 
          />
        </>
      )
    }
    
  }

  return (
   <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle slot="start">Docs Scan</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={showShareActionSheet} color="secondary">
              <IonIcon slot="icon-only"  icon={shareOutline} />
            </IonButton>
            <IonButton onClick={goToSettings} color="secondary">
              <IonIcon slot="icon-only"  icon={settingsOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ height: "100%" }}>
        {renderScanner()}
        <IonFab style={{display:"flex"}} vertical="bottom" horizontal="start" slot="fixed">
          <IonFabButton style={{marginRight:"10px"}} onClick={() => {
            setRemoteScan(true);
            resetScanStateDelayed();
          }} >
            <IonIcon icon={documentOutline} />
          </IonFabButton>
          <IonFabButton style={{marginRight:"10px"}} onClick={() => {
            setScan(true);
            resetScanStateDelayed();
          }} >
            <IonIcon icon={cameraOutline} />
          </IonFabButton>
          <IonFabButton onClick={loadFile} >
            <IonIcon icon={imageOutline} />
          </IonFabButton>
        </IonFab>
        <IonFab style={{display:"flex"}} vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={showImageActionSheet}>
            <IonIcon icon={ellipsisVerticalOutline} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
  
}

export default Home;