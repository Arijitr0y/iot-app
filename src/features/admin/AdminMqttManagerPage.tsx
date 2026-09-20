import { MqttAclManager } from './MqttAclManager';

export const AdminMqttManagerPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MQTT Security</h1>
        <p className="text-gray-500">Manage Mosquitto service accounts and topic Access Control Lists (ACLs).</p>
      </div>
      
      <MqttAclManager />
    </div>
  );
};
