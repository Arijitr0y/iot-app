import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from './components/StepIndicator';
import { Step1SelectType } from './components/steps/Step1SelectType';
import { Step2Preparation } from './components/steps/Step2Preparation';
import { Step3ConnectESP } from './components/steps/Step3ConnectESP';
import { Step4ScanNetworks } from './components/steps/Step4ScanNetworks';
import { Step5EnterPassword } from './components/steps/Step5EnterPassword';
import { Step6Provisioning } from './components/steps/Step6Provisioning';
import { Step7Complete } from './components/steps/Step7Complete';

export const ProvisioningWizard = () => {
  const navigate = useNavigate();
  // Helper to load state from sessionStorage
  const loadState = (key: string, defaultValue: any) => {
    try {
      const saved = sessionStorage.getItem(`provisioning_${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [currentStep, setCurrentStep] = useState<number>(loadState('currentStep', 1));
  const totalSteps = 7;

  // Wizard State
  const [selectedType, setSelectedType] = useState<any | null>(loadState('selectedType', null));
  const [targetSsid, setTargetSsid] = useState<string>(loadState('targetSsid', ''));
  const [targetPassword, setTargetPassword] = useState<string>(loadState('targetPassword', ''));
  const [deviceMac, setDeviceMac] = useState<string>(loadState('deviceMac', ''));
  const [sessionToken, setSessionToken] = useState<string>(loadState('sessionToken', ''));

  // Sync state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('provisioning_currentStep', JSON.stringify(currentStep));
    sessionStorage.setItem('provisioning_selectedType', JSON.stringify(selectedType));
    sessionStorage.setItem('provisioning_targetSsid', JSON.stringify(targetSsid));
    sessionStorage.setItem('provisioning_targetPassword', JSON.stringify(targetPassword));
    sessionStorage.setItem('provisioning_deviceMac', JSON.stringify(deviceMac));
    sessionStorage.setItem('provisioning_sessionToken', JSON.stringify(sessionToken));
    
    // We no longer clear sessionStorage immediately on Step 7.
    // We will clear it when the user clicks 'Go to Dashboard' in Step 7,
    // so that if Vite auto-reloads during Step 7, the state isn't lost.
  }, [currentStep, selectedType, targetSsid, targetPassword, deviceMac, sessionToken]);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1SelectType 
            onNext={nextStep}
            onBack={() => navigate('/')}
            selectedType={selectedType}
            onSelect={setSelectedType}
          />
        );
      case 2:
        return <Step2Preparation onNext={nextStep} onBack={prevStep} />;
      case 3:
        return (
          <Step3ConnectESP 
            onNext={(mac, token) => {
              if (mac) setDeviceMac(mac);
              if (token) setSessionToken(token);
              nextStep();
            }} 
            onBack={prevStep} 
            prefix={selectedType?.setup_wifi_prefix || 'IoT-Setup-'} 
          />
        );
      case 4:
        return (
          <Step4ScanNetworks 
            onBack={prevStep}
            onNext={(ssid) => {
              setTargetSsid(ssid);
              nextStep();
            }} 
          />
        );
      case 5:
        return (
          <Step5EnterPassword 
            ssid={targetSsid}
            onBack={prevStep}
            onNext={(password) => {
              setTargetPassword(password);
              nextStep();
            }} 
          />
        );
      case 6:
        return (
          <Step6Provisioning 
            ssid={targetSsid} 
            password={targetPassword} 
            deviceMac={deviceMac}
            sessionToken={sessionToken}
            deviceTypeId={selectedType?.id}
            onComplete={nextStep} 
            onRetry={() => setCurrentStep(4)}
            onCancel={() => {
              sessionStorage.removeItem('provisioning_step6_sent');
              setCurrentStep(1);
            }}
          />
        );
      case 7:
        return <Step7Complete />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
      
      <Card className="shadow-lg border-0 bg-white/50 backdrop-blur-sm">
        <CardContent className="p-6 sm:p-10">
          {renderStep()}
        </CardContent>
      </Card>
    </div>
  );
};
